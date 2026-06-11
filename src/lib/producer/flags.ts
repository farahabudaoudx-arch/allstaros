import type { SupabaseClient } from "@supabase/supabase-js";

// Builder "Flagged" feed: surfaces people in the builder's downline who need
// attention. Every query below runs through the AUTHED client, so RLS already
// scopes recruits/producers/check-ins/tracker rows to the viewer's downline.
//
// All date math is done in UTC. Thresholds live here in one place so they're
// easy to tune. The rule set (defined with the team):
//   Recruits   — exam not scheduled (3d), no check-ins yet (2d), check-ins lapsed (2d)
//   Producers  — missed daily log, didn't hit projections, no activity in 48h (weekdays)
// Bootcamp-gate and manual flags are intentionally NOT auto-surfaced here.

export type FlagSeverity = "warn" | "neg";
export type FlagCategory = "exam" | "checkin" | "log" | "projection" | "activity";

export type FlagItem = {
  id: string;
  personName: string;
  subtitle: string;
  reason: string;
  severity: FlagSeverity;
  category: FlagCategory;
  href: string;
};

// Recruit thresholds (whole days).
const EXAM_UNSCHEDULED_DAYS = 3; // licensing recruit with no exam date yet
const NO_CHECKIN_DAYS = 2; // never checked in, this long after signup
const CHECKIN_LAPSED_DAYS = 2; // last check-in older than this

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(iso: string): Date {
  // Accepts "YYYY-MM-DD" or a full timestamp; normalizes to UTC midnight.
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

// The most recent N completed weekdays (Mon–Fri) strictly before `today`,
// newest first. "48 hours on weekdays" = the last 2 business days.
function lastNWeekdays(today: Date, n: number): Date[] {
  const out: Date[] = [];
  const d = new Date(today);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
  }
  return out;
}

type RecruitRow = {
  id: string;
  person_id: string;
  created_at: string;
  phase: string;
  exam_date: string | null;
  person: { full_name: string; email: string; status: string } | null;
};

type ProducerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_builder: boolean;
  is_producer: boolean;
};

const METRIC_KEYS = ["leads", "dials", "contacts", "appointments", "presentations", "sales"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
type Metrics = Record<MetricKey, number>;
const ZERO_METRICS: Metrics = {
  leads: 0,
  dials: 0,
  contacts: 0,
  appointments: 0,
  presentations: 0,
  sales: 0,
};

type TrackerRow = {
  person_id: string;
  entry_date: string;
  leads: number | null;
  dials: number | null;
  contacts: number | null;
  appointments: number | null;
  presentations: number | null;
  sales: number | null;
};

type ProjectionRow = {
  person_id: string;
  leads: number | null;
  dials: number | null;
  contacts: number | null;
  appointments: number | null;
  presentations: number | null;
  sales: number | null;
};

/**
 * Compute the flagged feed for the current builder's downline.
 * @param supabase authed (RLS-scoped) client
 * @param meId     the viewer's person id, excluded from producer-side flags
 */
export async function computeTeamFlags(
  supabase: SupabaseClient,
  meId: string,
): Promise<FlagItem[]> {
  const today = new Date();
  const flags: FlagItem[] = [];

  // ---- Recruits: exam not scheduled + check-in stalls -------------------
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("id, person_id, created_at, phase, exam_date, person:person_id(full_name, email, status)")
    .is("removed_at", null);
  const recruits = (recruitData ?? []) as unknown as RecruitRow[];
  const recruitIds = recruits.map((r) => r.id);

  const lastCheckIn = new Map<string, string>();
  if (recruitIds.length > 0) {
    const { data: ci } = await supabase
      .from("check_in")
      .select("recruit_id, check_in_date")
      .in("recruit_id", recruitIds)
      .order("check_in_date", { ascending: false });
    for (const c of (ci ?? []) as { recruit_id: string; check_in_date: string }[]) {
      if (!lastCheckIn.has(c.recruit_id)) lastCheckIn.set(c.recruit_id, c.check_in_date);
    }
  }

  for (const r of recruits) {
    if (!r.person || r.person.status === "removed") continue;
    const name = r.person.full_name;
    const email = r.person.email;
    // Every flag opens the person's profile (same as clicking them in Downline),
    // which has analytics + a message button — rather than a one-off context page.
    const recruitHref = `/producer/downline/${r.person_id}`;
    const sinceSignup = daysBetween(today, startOfUtcDay(r.created_at));

    // Exam not scheduled — only while licensing.
    if (r.phase === "licensing" && !r.exam_date && sinceSignup >= EXAM_UNSCHEDULED_DAYS) {
      flags.push({
        id: `exam-${r.id}`,
        personName: name,
        subtitle: email,
        reason: `Exam not scheduled — ${sinceSignup}d`,
        severity: "neg",
        category: "exam",
        href: recruitHref,
      });
    }

    // Check-in cadence — graduated recruits are done with daily check-ins.
    if (r.phase !== "graduated") {
      const last = lastCheckIn.get(r.id);
      if (!last) {
        if (sinceSignup >= NO_CHECKIN_DAYS) {
          flags.push({
            id: `checkin-${r.id}`,
            personName: name,
            subtitle: email,
            reason: `No check-in yet — ${sinceSignup}d since signup`,
            severity: "warn",
            category: "checkin",
            href: recruitHref,
          });
        }
      } else {
        const days = daysBetween(today, startOfUtcDay(last));
        if (days >= CHECKIN_LAPSED_DAYS) {
          flags.push({
            id: `checkin-${r.id}`,
            personName: name,
            subtitle: email,
            reason: `No check-in in ${days} days`,
            severity: days >= 4 ? "neg" : "warn",
            category: "checkin",
            href: recruitHref,
          });
        }
      }
    }
  }

  // ---- Producers: missed log + missed projections + inactivity ----------
  const { data: rosterData } = await supabase
    .from("person")
    .select("id, full_name, email, is_builder, is_producer, status")
    .eq("status", "active")
    .or("is_producer.eq.true,is_builder.eq.true");
  const producers = (rosterData ?? []) as unknown as ProducerRow[];
  const producerIds = producers.map((p) => p.id);

  // Last two business days (newest first). 48 weekday-hours of activity.
  const bizDays = lastNWeekdays(today, 2);
  const lastBiz = bizDays[0];
  const lastBizIso = ymd(lastBiz);
  const lastBizLabel = lastBiz.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const bizWindow = new Set(bizDays.map(ymd));

  const loggedLastBiz = new Set<string>(); // person ids that logged on lastBiz
  const activity48 = new Map<string, number>(); // activity summed over the 2 biz days
  const actualsLastBiz = new Map<string, Metrics>(); // logged numbers on lastBiz
  const projLastBiz = new Map<string, Metrics>(); // projected numbers for lastBiz

  if (producerIds.length > 0) {
    const earliest = ymd(bizDays[bizDays.length - 1]);
    const [{ data: tr }, { data: pj }] = await Promise.all([
      supabase
        .from("tracker_entry")
        .select("person_id, entry_date, leads, dials, contacts, appointments, presentations, sales")
        .gte("entry_date", earliest),
      supabase
        .from("daily_projection")
        .select("person_id, leads, dials, contacts, appointments, presentations, sales")
        .eq("entry_date", lastBizIso),
    ]);

    for (const t of (tr ?? []) as TrackerRow[]) {
      const day = t.entry_date.slice(0, 10);
      if (!bizWindow.has(day)) continue;
      if (day === lastBizIso) {
        loggedLastBiz.add(t.person_id);
        actualsLastBiz.set(t.person_id, {
          leads: Number(t.leads ?? 0),
          dials: Number(t.dials ?? 0),
          contacts: Number(t.contacts ?? 0),
          appointments: Number(t.appointments ?? 0),
          presentations: Number(t.presentations ?? 0),
          sales: Number(t.sales ?? 0),
        });
      }
      const act =
        Number(t.dials ?? 0) +
        Number(t.contacts ?? 0) +
        Number(t.appointments ?? 0) +
        Number(t.presentations ?? 0);
      activity48.set(t.person_id, (activity48.get(t.person_id) ?? 0) + act);
    }

    for (const p of (pj ?? []) as ProjectionRow[]) {
      projLastBiz.set(p.person_id, {
        leads: Number(p.leads ?? 0),
        dials: Number(p.dials ?? 0),
        contacts: Number(p.contacts ?? 0),
        appointments: Number(p.appointments ?? 0),
        presentations: Number(p.presentations ?? 0),
        sales: Number(p.sales ?? 0),
      });
    }
  }

  for (const p of producers) {
    if (p.id === meId) continue; // don't flag the viewer against themselves
    const name = p.full_name ?? "Unknown";
    const role = p.is_builder ? "Builder" : "Producer";
    const href = `/producer/downline/${p.id}`;

    // Missed daily log — no entry at all on the most recent business day.
    if (!loggedLastBiz.has(p.id)) {
      flags.push({
        id: `log-${p.id}`,
        personName: name,
        subtitle: role,
        reason: `No data logged ${lastBizLabel}`,
        severity: "warn",
        category: "log",
        href,
      });
    }

    // Didn't hit projections — fell short on ANY projected daily number.
    const proj = projLastBiz.get(p.id);
    if (proj) {
      const act = actualsLastBiz.get(p.id) ?? ZERO_METRICS;
      const missed = METRIC_KEYS.filter((k) => proj[k] > 0 && act[k] < proj[k]);
      if (missed.length > 0) {
        flags.push({
          id: `projection-${p.id}`,
          personName: name,
          subtitle: role,
          reason: `Missed projection — short on ${missed.join(", ")} ${lastBizLabel}`,
          severity: "warn",
          category: "projection",
          href,
        });
      }
    }

    // No activity over the last 48 weekday-hours.
    if ((activity48.get(p.id) ?? 0) === 0) {
      flags.push({
        id: `activity-${p.id}`,
        personName: name,
        subtitle: role,
        reason: "No activity in 48h",
        severity: "neg",
        category: "activity",
        href,
      });
    }
  }

  // Most urgent first (neg before warn), then by name for stability.
  const rank: Record<FlagSeverity, number> = { neg: 0, warn: 1 };
  flags.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.personName.localeCompare(b.personName),
  );
  return flags;
}
