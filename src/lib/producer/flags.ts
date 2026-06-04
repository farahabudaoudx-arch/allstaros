import type { SupabaseClient } from "@supabase/supabase-js";

// Builder "Flagged" feed: surfaces people in the builder's downline who need
// attention. Every query below runs through the AUTHED client, so RLS already
// scopes recruits/producers/check-ins/tracker rows to the viewer's downline.
//
// All date math is done in UTC. The thresholds here are deliberately simple and
// live in one place so they're easy to tune later.

export type FlagSeverity = "warn" | "neg";
export type FlagCategory = "checkin" | "data" | "activity" | "manual";

export type FlagItem = {
  id: string;
  personName: string;
  subtitle: string;
  reason: string;
  severity: FlagSeverity;
  category: FlagCategory;
  href: string;
};

// 48 hours, expressed in whole days against a DATE column (check_in_date).
const STALE_CHECKIN_DAYS = 2;
// Window we scan tracker activity over for the "inactive" flag.
const ACTIVITY_WINDOW_DAYS = 7;

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

// Most recent completed weekday (Mon–Fri) strictly before `today`.
function lastWeekday(today: Date): Date {
  const d = new Date(today);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}

type RecruitRow = {
  id: string;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
  phase: string;
  person: { full_name: string; email: string; status: string } | null;
};

type ProducerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_builder: boolean;
  is_producer: boolean;
};

type TrackerRow = {
  person_id: string;
  entry_date: string;
  dials: number | null;
  contacts: number | null;
  appointments: number | null;
  presentations: number | null;
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

  // ---- Recruits: stale check-ins + manual flags -------------------------
  const { data: recruitData } = await supabase
    .from("recruit")
    .select(
      "id, flagged, flag_reason, created_at, phase, person:person_id(full_name, email, status)",
    )
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

    if (r.flagged) {
      flags.push({
        id: `manual-${r.id}`,
        personName: name,
        subtitle: email,
        reason: r.flag_reason?.trim() || "Flagged for review",
        severity: "neg",
        category: "manual",
        href: `/producer/recruiting/recruit/${r.id}`,
      });
    }

    // Graduated recruits are done with the daily check-in cadence.
    if (r.phase !== "graduated") {
      const last = lastCheckIn.get(r.id);
      const ref = last ? startOfUtcDay(last) : startOfUtcDay(r.created_at);
      const days = daysBetween(today, ref);
      if (days >= STALE_CHECKIN_DAYS) {
        flags.push({
          id: `checkin-${r.id}`,
          personName: name,
          subtitle: email,
          reason: last
            ? `No check-in in ${days} days`
            : `No check-in yet — ${days} days since signup`,
          severity: days >= 4 ? "neg" : "warn",
          category: "checkin",
          href: `/producer/messages/${r.id}`,
        });
      }
    }
  }

  // ---- Producers: missed weekday log + inactivity -----------------------
  const { data: rosterData } = await supabase
    .from("person")
    .select("id, full_name, email, is_builder, is_producer, status")
    .eq("status", "active")
    .or("is_producer.eq.true,is_builder.eq.true");
  const producers = (rosterData ?? []) as unknown as ProducerRow[];
  const producerIds = producers.map((p) => p.id);

  const loggedDates = new Map<string, Set<string>>();
  const activityTotal = new Map<string, number>();
  if (producerIds.length > 0) {
    const since = ymd(
      new Date(today.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000),
    );
    const { data: tr } = await supabase
      .from("tracker_entry")
      .select("person_id, entry_date, dials, contacts, appointments, presentations")
      .gte("entry_date", since);
    for (const t of (tr ?? []) as TrackerRow[]) {
      if (!loggedDates.has(t.person_id)) loggedDates.set(t.person_id, new Set());
      loggedDates.get(t.person_id)!.add(t.entry_date.slice(0, 10));
      const act =
        Number(t.dials ?? 0) +
        Number(t.contacts ?? 0) +
        Number(t.appointments ?? 0) +
        Number(t.presentations ?? 0);
      activityTotal.set(t.person_id, (activityTotal.get(t.person_id) ?? 0) + act);
    }
  }

  const lw = lastWeekday(today);
  const lwIso = ymd(lw);
  const lwLabel = lw.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

  for (const p of producers) {
    if (p.id === meId) continue; // don't flag the viewer against themselves
    const name = p.full_name ?? "Unknown";
    const role = p.is_builder ? "Builder" : "Producer";
    const dates = loggedDates.get(p.id);

    if (!dates || !dates.has(lwIso)) {
      flags.push({
        id: `data-${p.id}`,
        personName: name,
        subtitle: role,
        reason: `No data logged ${lwLabel}`,
        severity: "warn",
        category: "data",
        href: `/producer/team/${p.id}`,
      });
    }

    if ((activityTotal.get(p.id) ?? 0) === 0) {
      flags.push({
        id: `activity-${p.id}`,
        personName: name,
        subtitle: role,
        reason: `No activity in ${ACTIVITY_WINDOW_DAYS} days`,
        severity: "neg",
        category: "activity",
        href: `/producer/team/${p.id}`,
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
