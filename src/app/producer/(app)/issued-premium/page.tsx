import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  IssuedPremiumView,
  type IpReport,
  type PeriodKey,
} from "@/components/producer/issued-premium/IssuedPremiumView";
import { loadGatewayConnectionState } from "@/lib/gateway/connection";
import {
  GATEWAY_NEVER_CONNECTED_COPY,
  GATEWAY_RECONNECT_COPY,
  gatewayIssuedPaidHistoryVisible,
  type GatewayConnectionState,
} from "@/lib/gateway/connection-types";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  period_type: PeriodKey;
  report_date: string;
  period_start: string | null;
  scorecard_period_start: string | null;
  scorecard_period_end: string | null;
  gateway_week_ordinal: number | null;
  gateway_period_final: boolean | null;
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
function rangeLabel(row: Row): string {
  if (row.gateway_label?.trim()) return row.gateway_label.trim();
  const coverage = row.scorecard_period_start ?? row.period_start ?? row.report_date;
  const [y, m] = coverage.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (row.period_type === "wtd" && row.gateway_week_ordinal) return `${month} · Week ${row.gateway_week_ordinal}`;
  if (row.period_type === "mtd") return `${month} · MTD`;
  return `${coverage.slice(0, 4)} · YTD`;
}

function issuedPaidBlockedCopy(state: GatewayConnectionState) {
  if (state.status === "unavailable") {
    return {
      title: "Gateway status unavailable",
      body: "We cannot verify your personal Gateway connection right now, so Gateway-dependent values are hidden instead of showing stale or guessed numbers.",
    };
  }
  return {
    title: "Connect Gateway to see Issued Premium",
    body: GATEWAY_NEVER_CONNECTED_COPY,
  };
}

export default async function IssuedPremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/issued-premium");

  // Development-only visual QA: ?as=Full Name renders another member's view
  // without changing authentication. NODE_ENV prevents this service-role path
  // from being reachable in production.
  const { as } = await searchParams;
  let view = {
    id: person.id,
    full_name: person.full_name,
    is_builder: person.is_builder,
    npn: person.npn,
  };
  let previewingAnotherMember = false;
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
      previewingAnotherMember = true;
      supabase = service;
    }
  }

  const gatewayConnection = await loadGatewayConnectionState(view.id);
  const showHistory = gatewayIssuedPaidHistoryVisible(gatewayConnection);
  let rows: Row[] = [];
  let reportsError = false;
  let latestPullStatus: string | null = null;

  if (showHistory) {
    const service = createServiceRoleClient();
    const [result, latestJob] = await Promise.all([
      supabase
        .from("producer_issued_premium")
        .select(
          "id, period_type, report_date, period_start, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, gateway_label, personal_ip_cents, team_ip_cents, first_leg_producer, first_leg_percent, outside_first_leg_cents, created_at",
        )
        .eq("person_id", view.id)
        .eq("source_kind", "personal_gateway")
        .order("report_date", { ascending: true })
        .order("created_at", { ascending: true }),
      service
        .from("gateway_report_pull_job")
        .select("status")
        .eq("person_id", view.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    reportsError = Boolean(result.error);
    rows = reportsError ? [] : ((result.data as Row[] | null) ?? []);
    latestPullStatus = latestJob.error ? null : (latestJob.data?.status as string | undefined) ?? null;
  }

  const reports: IpReport[] = rows.map((row) => ({
    id: row.id,
    reportDate: row.report_date,
    coverageStart: row.scorecard_period_start ?? row.period_start ?? row.report_date,
    rangeLabel: rangeLabel(row),
    uploadedAt: row.created_at,
    periods: {
      [row.period_type]: {
        personalCents: row.personal_ip_cents,
        teamCents: row.team_ip_cents,
        firstLegProducer: row.first_leg_producer || null,
        firstLegPercent: row.first_leg_percent == null ? null : Number(row.first_leg_percent),
        outsideFirstLegCents: row.outside_first_leg_cents,
      },
    },
  })).sort((left, right) =>
    left.reportDate.localeCompare(right.reportDate)
      || left.coverageStart.localeCompare(right.coverageStart)
      || left.id.localeCompare(right.id));

  // Builders: count the active producers in their downline (including
  // themself, since their personal production is part of team IP). With the
  // normal RLS client the person query already returns exactly self +
  // downline. During development preview the service client sees everyone, so
  // we walk the upline tree from the viewed person explicitly in both modes.
  let agentCount: number | null = null;
  if (showHistory && !reportsError && view.is_builder) {
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

  const historyNotice =
    showHistory && !gatewayConnection.connected
      ? {
          body: `${GATEWAY_RECONNECT_COPY} Reports we already pulled stay here. New weeks will not appear until you reconnect.`,
          href: "/producer?settings=gateway",
          cta: "Reconnect Gateway",
        }
      : null;

  const blocked = !showHistory;
  const blockedCopy = issuedPaidBlockedCopy(gatewayConnection);
  const waitingForFirstPersonalPull = showHistory && !reportsError && rows.length === 0 &&
    gatewayConnection.connected && gatewayConnection.initialBackfillCompletedAt == null &&
    (latestPullStatus === "queued" || latestPullStatus === "running" || latestPullStatus == null);
  const firstPersonalPullFailed = showHistory && !reportsError && rows.length === 0 &&
    (latestPullStatus === "failed" || latestPullStatus === "needs_reconnect");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      {previewingAnotherMember && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/[0.06] px-4 py-2.5 text-sm text-accent">
          Viewing report as {view.full_name}{" "}
          {view.is_builder ? "(Builder)" : "(Producer)"}
        </p>
      )}

      {blocked ? (
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
              {blockedCopy.title}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-subtle">
              {blockedCopy.body}
            </p>
            {gatewayConnection.status !== "unavailable" ? (
              <Link
                href="/producer?settings=gateway"
                className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black"
              >
                Connect Gateway
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
              The report data could not be loaded. We are hiding the values instead of substituting zero or stale data.
            </p>
          </section>
        </div>
      ) : waitingForFirstPersonalPull || firstPersonalPullFailed ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <Link href="/producer/menu/my-numbers" className="text-sm text-subtle transition hover:text-ink">
              ← My Numbers
            </Link>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Issued Premium</span>
          </div>
          <section className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {firstPersonalPullFailed ? "Your Gateway report needs attention" : "Your Gateway reports are being prepared"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-subtle">
              {firstPersonalPullFailed
                ? "We did not replace your personal Gateway results with older agency data. Reconnect Gateway if prompted, then we will retry the personal report pull."
                : "Your personal Gateway connection is active. Issued Premium will appear after the first personal report pull finishes."}
            </p>
            {firstPersonalPullFailed ? (
              <Link href="/producer?settings=gateway" className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black">
                Gateway Settings
              </Link>
            ) : null}
          </section>
        </div>
      ) : (
        <IssuedPremiumView
          reports={reports}
          isBuilder={view.is_builder}
          agentCount={agentCount}
          backHref="/producer/menu/my-numbers"
          notice={historyNotice}
        />
      )}
    </main>
  );
}
