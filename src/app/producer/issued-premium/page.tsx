import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  IssuedPremiumView,
  type IpReport,
  type PeriodKey,
} from "@/components/producer/issued-premium/IssuedPremiumView";

export const dynamic = "force-dynamic";

type Row = {
  period_type: PeriodKey;
  report_date: string;
  gateway_label: string | null;
  personal_ip_cents: number;
  team_ip_cents: number;
  first_leg_producer: string | null;
  first_leg_percent: string | number | null;
  outside_first_leg_cents: number;
  created_at: string;
};

// Prefer the WTD label ("June Week 3") as the report's display range since it
// reads as a week. When a report has no WTD row for this person (no
// production that week), fall back to the report date; the MTD/YTD labels
// repeat across uploads and would show as duplicates.
function rangeLabel(labels: Partial<Record<PeriodKey, string | null>>, reportDate: string): string {
  if (labels.wtd) return labels.wtd;
  const [y, m, d] = reportDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function IssuedPremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/issued-premium");

  // Local-dev only: ?as=Full Name renders the page with another person's
  // data so views can be checked without their login. Ignored in production
  // builds, so it can never leak real data.
  const { as } = await searchParams;
  let view = {
    id: person.id,
    full_name: person.full_name,
    is_builder: person.is_builder,
    npn: person.npn,
  };
  let devViewing = false;
  let supabase = await createClient();
  if (as && process.env.NODE_ENV === "development") {
    const service = createServiceRoleClient();
    const { data: target } = await service
      .from("person")
      .select("id, full_name, is_builder, npn")
      .ilike("full_name", as)
      .maybeSingle();
    if (target) {
      view = target;
      devViewing = true;
      supabase = service;
    }
  }

  const { data } = await supabase
    .from("producer_issued_premium")
    .select(
      "period_type, report_date, gateway_label, personal_ip_cents, team_ip_cents, first_leg_producer, first_leg_percent, outside_first_leg_cents, created_at",
    )
    .eq("person_id", view.id)
    .order("report_date", { ascending: true });

  // Fold the up-to-three period rows per report date into one report entry.
  const byDate = new Map<string, { report: IpReport; labels: Partial<Record<PeriodKey, string | null>> }>();
  for (const row of (data as Row[] | null) ?? []) {
    let entry = byDate.get(row.report_date);
    if (!entry) {
      entry = {
        report: {
          reportDate: row.report_date,
          rangeLabel: "",
          uploadedAt: row.created_at,
          periods: {},
        },
        labels: {},
      };
      byDate.set(row.report_date, entry);
    }
    entry.labels[row.period_type] = row.gateway_label;
    if (row.created_at > entry.report.uploadedAt) {
      entry.report.uploadedAt = row.created_at;
    }
    entry.report.periods[row.period_type] = {
      personalCents: row.personal_ip_cents,
      teamCents: row.team_ip_cents,
      firstLegProducer: row.first_leg_producer || null,
      firstLegPercent:
        row.first_leg_percent == null ? null : Number(row.first_leg_percent),
      outsideFirstLegCents: row.outside_first_leg_cents,
    };
  }

  const reports = [...byDate.values()].map(({ report, labels }) => ({
    ...report,
    rangeLabel: rangeLabel(labels, report.reportDate),
  }));

  // Builders: count the active producers in their downline (including
  // themself, since their personal production is part of team IP). With the
  // normal RLS client the person query already returns exactly self +
  // downline; in dev view-as mode the service client sees everyone, so we
  // walk the upline tree from the viewed person either way.
  let agentCount: number | null = null;
  if (view.is_builder) {
    const { data: peopleRows } = await supabase
      .from("person")
      .select("id, upline_id, status, is_producer, is_builder");
    const all = (peopleRows ?? []) as Array<{
      id: string;
      upline_id: string | null;
      status: string;
      is_producer: boolean;
      is_builder: boolean;
    }>;
    const children = new Map<string, string[]>();
    const byId = new Map(all.map((p) => [p.id, p]));
    for (const p of all) {
      if (!p.upline_id) continue;
      const list = children.get(p.upline_id) ?? [];
      list.push(p.id);
      children.set(p.upline_id, list);
    }
    let count = 0;
    const queue = [view.id];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const p = byId.get(id);
      if (p && p.status === "active" && (p.is_producer || p.is_builder)) count++;
      for (const child of children.get(id) ?? []) queue.push(child);
    }
    agentCount = count;
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      {devViewing && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/[0.06] px-4 py-2.5 text-sm text-accent">
          Dev preview: viewing as {view.full_name}{" "}
          {view.is_builder ? "(Builder)" : "(Producer)"}
        </p>
      )}
      <IssuedPremiumView
        reports={reports}
        isBuilder={view.is_builder}
        agentCount={agentCount}
      />
    </main>
  );
}
