import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  IssuedPremiumView,
  type IpReport,
  type PeriodKey,
} from "@/components/producer/issued-premium/IssuedPremiumView";

import { loadGatewayConnectionState } from "@/lib/gateway/connection";
import Link from "next/link";
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

  const gatewayConnection = await loadGatewayConnectionState(view.id);
  let rows: Row[] = [];
  let reportsError = false;

  if (gatewayConnection.connected) {
    const result = await supabase
      .from("producer_issued_premium")
      .select(
        "period_type, report_date, gateway_label, personal_ip_cents, team_ip_cents, first_leg_producer, first_leg_percent, outside_first_leg_cents, created_at",
      )
      .eq("person_id", view.id)
      .order("report_date", { ascending: true });
    reportsError = Boolean(result.error);
    rows = reportsError ? [] : ((result.data as Row[] | null) ?? []);
  }

  const byDate = new Map<
    string,
    { report: IpReport; labels: Partial<Record<PeriodKey, string | null>> }
  >();
  for (const row of rows) {
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
  if (gatewayConnection.connected && !reportsError && view.is_builder) {
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

  const connectionBlocked = !gatewayConnection.connected;
  const blockedTitle =
    gatewayConnection.status === "unavailable"
      ? "Gateway status unavailable"
      : gatewayConnection.everConnected
        ? "Reconnect Gateway to refresh Issued Premium"
        : "Connect Gateway to see Issued Premium";
  const blockedCopy =
    gatewayConnection.status === "unavailable"
      ? "We cannot verify your personal Gateway connection right now, so Gateway-dependent values are hidden instead of showing stale or guessed numbers."
      : gatewayConnection.everConnected
        ? "Your previous connection is no longer active. Current Gateway-dependent values stay unknown until you reconnect."
        : "All Star OS cannot report your personal Issued Premium until you connect your own Gateway login.";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      {devViewing && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/[0.06] px-4 py-2.5 text-sm text-accent">
          Dev preview: viewing as {view.full_name}{" "}
          {view.is_builder ? "(Builder)" : "(Producer)"}
        </p>
      )}

      {connectionBlocked ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/producer/menu/my-numbers"
              className="text-sm text-subtle transition hover:text-ink"
            >
              ← My Numbers
            </Link>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-mute">
              Issued Premium
            </span>
          </div>
          <section className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {blockedTitle}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-subtle">
              {blockedCopy}
            </p>
            {gatewayConnection.status !== "unavailable" ? (
              <Link
                href="/producer?settings=gateway"
                className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black"
              >
                {gatewayConnection.everConnected ? "Reconnect Gateway" : "Connect Gateway"}
              </Link>
            ) : null}
          </section>
        </div>
      ) : reportsError ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/producer/menu/my-numbers"
              className="text-sm text-subtle transition hover:text-ink"
            >
              ← My Numbers
            </Link>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-mute">
              Issued Premium
            </span>
          </div>
          <section className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              Issued Premium is temporarily unavailable
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-subtle">
              Your Gateway is connected, but the report data could not be loaded. We are hiding the values instead of substituting zero or stale data.
            </p>
          </section>
        </div>
      ) : (
        <IssuedPremiumView
          reports={reports}
          isBuilder={view.is_builder}
          agentCount={agentCount}
          backHref="/producer/menu/my-numbers"
        />
      )}
    </main>
  );
}
