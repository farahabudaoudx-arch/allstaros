import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

type AgentStatus = {
  agent_id: string;
  agent_name: string;
  machine_id: string;
  source: string;
  status: "online" | "running" | "success" | "partial" | "failed" | "offline" | "unknown";
  last_heartbeat_at: string | null;
  last_run_id: string | null;
  last_run_status: "running" | "success" | "partial" | "failed" | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
  report_date: string | null;
  report_label: string | null;
  updated_at: string;
};

type AgentRun = {
  id: string;
  agent_id: string;
  status: "running" | "success" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  report_date: string | null;
  report_label: string | null;
  wtd_status: string | null;
  wtd_rows: number | null;
  wtd_pages: number | null;
  mtd_status: string | null;
  mtd_rows: number | null;
  mtd_pages: number | null;
  ytd_status: string | null;
  ytd_rows: number | null;
  ytd_pages: number | null;
  error_message: string | null;
};

const CENTRAL = "America/Chicago";
const STALE_AFTER_MS = 15 * 60 * 1000;

function centralTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function isStale(agent: AgentStatus): boolean {
  if (!agent.last_heartbeat_at) return true;
  return Date.now() - new Date(agent.last_heartbeat_at).getTime() > STALE_AFTER_MS;
}

function agentLabel(agent: AgentStatus): {
  label: string;
  className: string;
  detail: string;
} {
  if (isStale(agent)) {
    return {
      label: "Offline",
      className: "bg-red-500/10 text-red-300 ring-red-500/30",
      detail: "No heartbeat in the last 15 minutes.",
    };
  }
  if (agent.status === "running" || agent.last_run_status === "running") {
    return {
      label: "Running",
      className: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
      detail: "The agent is actively working.",
    };
  }
  if (agent.status === "failed" || agent.last_run_status === "failed") {
    return {
      label: "Needs attention",
      className: "bg-red-500/10 text-red-300 ring-red-500/30",
      detail: agent.last_error_message ?? "The last run failed.",
    };
  }
  if (agent.status === "partial" || agent.last_run_status === "partial") {
    return {
      label: "Working",
      className: "bg-amber-500/10 text-amber-200 ring-amber-500/30",
      detail: "The last run completed with a skipped or unavailable period.",
    };
  }
  return {
    label: "Working",
    className: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    detail: "Heartbeat is current.",
  };
}

function RunStatusBadge({ status }: { status: AgentRun["status"] }) {
  const className =
    status === "failed"
      ? "bg-red-500/10 text-red-300 ring-red-500/30"
      : status === "running"
        ? "bg-sky-500/10 text-sky-300 ring-sky-500/30"
        : status === "partial"
          ? "bg-amber-500/10 text-amber-200 ring-amber-500/30"
          : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${className}`}>
      {status}
    </span>
  );
}

function PeriodStat({
  label,
  status,
  rows,
  pages,
}: {
  label: string;
  status: string | null;
  rows: number | null;
  pages: number | null;
}) {
  const text =
    status === "success"
      ? `${rows ?? 0} rows${pages ? ` / ${pages} pages` : ""}`
      : status === "skipped"
        ? "Skipped"
        : status === "failed"
          ? "Failed"
          : "Not run";
  return (
    <div className="rounded-lg border border-hairline bg-card px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {label}
      </p>
      <p className="mt-1 text-sm text-ink">{text}</p>
    </div>
  );
}

function AgentCard({
  agent,
  runs,
}: {
  agent: AgentStatus;
  runs: AgentRun[];
}) {
  const display = agentLabel(agent);
  const recentRuns = runs.filter((run) => run.agent_id === agent.agent_id).slice(0, 5);

  return (
    <section className="rounded-2xl border border-hairline bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{agent.agent_name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${display.className}`}>
              {display.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-subtle">{display.detail}</p>
          <p className="mt-2 font-mono text-xs text-mute">
            {agent.machine_id} · {agent.source}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Last heartbeat
          </p>
          <p className="mt-1 text-sm text-ink">{centralTime(agent.last_heartbeat_at)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-card-hi p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Last run
          </p>
          <p className="mt-1 text-sm text-ink">
            {centralTime(agent.last_run_finished_at ?? agent.last_run_started_at)}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-card-hi p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Latest report
          </p>
          <p className="mt-1 text-sm text-ink">
            {agent.report_label ?? agent.report_date ?? "Not reported"}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-card-hi p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Last success
          </p>
          <p className="mt-1 text-sm text-ink">{centralTime(agent.last_success_at)}</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Recent receipts</h3>
        <div className="mt-3 flex flex-col gap-2">
          {recentRuns.map((run) => (
            <div key={run.id} className="rounded-xl border border-hairline bg-card-hi p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={run.status} />
                  <p className="text-sm text-ink">
                    {run.report_label ?? run.report_date ?? "No report label"}
                  </p>
                </div>
                <p className="font-mono text-xs text-mute">
                  {centralTime(run.finished_at ?? run.started_at)}
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PeriodStat label="WTD" status={run.wtd_status} rows={run.wtd_rows} pages={run.wtd_pages} />
                <PeriodStat label="MTD" status={run.mtd_status} rows={run.mtd_rows} pages={run.mtd_pages} />
                <PeriodStat label="YTD" status={run.ytd_status} rows={run.ytd_rows} pages={run.ytd_pages} />
              </div>
              {run.error_message ? (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200">
                  {run.error_message}
                </p>
              ) : null}
            </div>
          ))}
          {recentRuns.length === 0 ? (
            <p className="rounded-xl border border-hairline bg-card-hi p-4 text-sm text-mute">
              No run receipts yet.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function AdminAgentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: statusData, error: statusError } = await supabase
    .from("automation_agent_status")
    .select(
      "agent_id, agent_name, machine_id, source, status, last_heartbeat_at, last_run_id, last_run_status, last_run_started_at, last_run_finished_at, last_success_at, last_error_message, report_date, report_label, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (statusError) {
    throw new Error(statusError.message);
  }

  const agents = (statusData ?? []) as AgentStatus[];
  const agentIds = agents.map((agent) => agent.agent_id);

  let runs: AgentRun[] = [];
  if (agentIds.length > 0) {
    const { data: runData, error: runError } = await supabase
      .from("automation_agent_runs")
      .select(
        "id, agent_id, status, started_at, finished_at, report_date, report_label, wtd_status, wtd_rows, wtd_pages, mtd_status, mtd_rows, mtd_pages, ytd_status, ytd_rows, ytd_pages, error_message",
      )
      .in("agent_id", agentIds)
      .order("started_at", { ascending: false })
      .limit(50);
    if (runError) {
      throw new Error(runError.message);
    }
    runs = (runData ?? []) as AgentRun[];
  }

  const needsAttention = agents.filter((agent) => {
    const label = agentLabel(agent).label;
    return label === "Needs attention" || label === "Offline";
  }).length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Automation Agents
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Rentamac runs the workers. This page shows whether they are online,
          what they last did, and whether customer service needs to step in.
        </p>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Agents
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">{agents.length}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Need attention
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">{needsAttention}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Stale threshold
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">15m</p>
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.agent_id} agent={agent} runs={runs} />
        ))}
        {agents.length === 0 ? (
          <section className="rounded-2xl border border-hairline bg-card p-6">
            <h2 className="text-lg font-semibold text-ink">No agents reporting yet</h2>
            <p className="mt-2 text-sm text-subtle">
              Once the Rentamac heartbeat script runs, the Gateway IP Agent will
              appear here.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
