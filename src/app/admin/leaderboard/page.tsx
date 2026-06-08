import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeLeaderboard, type RangeKey } from "@/lib/producer/metrics";
import { money, num } from "@/lib/producer/format";

const TZ = "America/Chicago";

type MetricKey =
  | "ap_cents"
  | "sales"
  | "dials"
  | "contacts"
  | "presentations"
  | "lead_spend_cents";

const METRICS: Array<{ key: MetricKey; label: string; money?: boolean }> = [
  { key: "ap_cents", label: "AP", money: true },
  { key: "sales", label: "Sales" },
  { key: "dials", label: "Dials" },
  { key: "contacts", label: "Contacts" },
  { key: "presentations", label: "Presentations" },
  { key: "lead_spend_cents", label: "Lead Spend", money: true },
];

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

type Row = {
  person_id: string;
  full_name: string;
  ap_cents: number;
  sales: number;
  dials: number;
  contacts: number;
  presentations: number;
  lead_spend_cents: number;
};

function buildHref(
  base: Record<string, string | string[] | undefined>,
  patch: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  const merged = { ...base, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.append(k, v);
  }
  const q = params.toString();
  return q ? `/admin/leaderboard?${q}` : "/admin/leaderboard";
}

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    metric?: string;
    range?: string;
    builders?: string | string[];
    downline?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = createServiceRoleClient();

  const metric: MetricKey =
    (METRICS.find((m) => m.key === sp.metric)?.key as MetricKey) ?? "ap_cents";
  const rangeKey: RangeKey =
    (RANGES.find((r) => r.key === sp.range)?.key as RangeKey) ?? "mtd";
  const selectedBuilders = Array.isArray(sp.builders)
    ? sp.builders
    : sp.builders
      ? [sp.builders]
      : [];
  const includeDownline = sp.downline === "1";

  // Activity leaderboard (org-wide) + the resolved date window.
  const board = await computeLeaderboard(supabase, {
    rangeKey,
    tz: TZ,
    metric: "ap_cents",
  });

  // Lead spend over the same window (lead_purchases.amount is dollars).
  const { data: spendData } = await supabase
    .from("lead_purchases")
    .select("person_id, amount, purchase_date")
    .gte("purchase_date", board.range.from)
    .lte("purchase_date", board.range.to);
  const spendByPerson = new Map<string, number>();
  for (const s of (spendData ?? []) as Array<{ person_id: string; amount: number | null }>) {
    spendByPerson.set(
      s.person_id,
      (spendByPerson.get(s.person_id) ?? 0) + Math.round(Number(s.amount ?? 0) * 100),
    );
  }

  // All people — for the tree (downline), the builder picker, and names.
  const { data: peopleData } = await supabase
    .from("person")
    .select("id, full_name, upline_id, is_builder");
  const people = (peopleData ?? []) as Array<{
    id: string;
    full_name: string;
    upline_id: string | null;
    is_builder: boolean;
  }>;
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  const builders = people
    .filter((p) => p.is_builder)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  // children map for downline resolution.
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    if (!p.upline_id) continue;
    const arr = childrenOf.get(p.upline_id) ?? [];
    arr.push(p.id);
    childrenOf.set(p.upline_id, arr);
  }

  // Allowed person set when builders are selected.
  let allowed: Set<string> | null = null;
  if (selectedBuilders.length > 0) {
    allowed = new Set<string>();
    for (const bId of selectedBuilders) {
      allowed.add(bId);
      if (includeDownline) {
        // Full descendant tree.
        const stack = [...(childrenOf.get(bId) ?? [])];
        while (stack.length) {
          const cur = stack.pop()!;
          if (allowed.has(cur)) continue;
          allowed.add(cur);
          stack.push(...(childrenOf.get(cur) ?? []));
        }
      } else {
        // Direct reports only.
        for (const c of childrenOf.get(bId) ?? []) allowed.add(c);
      }
    }
  }

  // Merge activity + lead spend into one row set.
  const rowById = new Map<string, Row>();
  const ensure = (pid: string): Row => {
    let r = rowById.get(pid);
    if (!r) {
      r = {
        person_id: pid,
        full_name: nameById.get(pid) ?? "Unknown",
        ap_cents: 0,
        sales: 0,
        dials: 0,
        contacts: 0,
        presentations: 0,
        lead_spend_cents: 0,
      };
      rowById.set(pid, r);
    }
    return r;
  };
  for (const b of board.rows) {
    const r = ensure(b.person_id);
    r.ap_cents = b.ap_cents;
    r.sales = b.sales;
    r.dials = b.dials;
    r.contacts = b.contacts;
    r.presentations = b.presentations;
  }
  for (const [pid, cents] of spendByPerson) ensure(pid).lead_spend_cents = cents;

  let rows = [...rowById.values()];
  if (allowed) rows = rows.filter((r) => allowed!.has(r.person_id));
  rows.sort(
    (a, b) => b[metric] - a[metric] || b.ap_cents - a.ap_cents || a.full_name.localeCompare(b.full_name),
  );
  rows = rows.slice(0, 100);

  const baseParams = {
    metric,
    range: rangeKey,
    builders: selectedBuilders,
    downline: includeDownline ? "1" : "",
  };
  const metricCfg = METRICS.find((m) => m.key === metric)!;
  const fmt = (r: Row) => (metricCfg.money ? money(r[metric]) : num(r[metric]));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Leaderboard
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {allowed
            ? `Filtered to ${selectedBuilders.length} builder${selectedBuilders.length === 1 ? "" : "s"}${includeDownline ? " + downline" : " (direct reports)"}.`
            : "Everyone, organization-wide."}
        </p>
      </div>

      {/* Metric pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <Link
            key={m.key}
            href={buildHref(baseParams, { metric: m.key })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              m.key === metric
                ? "bg-accent text-black"
                : "border border-hairline text-subtle hover:border-accent hover:text-accent"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {/* Range pills */}
      <div className="mt-3 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={buildHref(baseParams, { range: r.key })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              r.key === rangeKey
                ? "bg-card-hi text-ink ring-1 ring-hairline"
                : "border border-hairline text-subtle hover:border-accent hover:text-accent"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* Builder filter */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-hairline bg-card p-4">
        <input type="hidden" name="metric" value={metric} />
        <input type="hidden" name="range" value={rangeKey} />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
            Builders (Ctrl/Cmd-click for several)
          </span>
          <select
            name="builders"
            multiple
            defaultValue={selectedBuilders}
            size={4}
            className="min-w-[14rem] rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            {builders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-subtle">
          <input
            type="checkbox"
            name="downline"
            value="1"
            defaultChecked={includeDownline}
          />
          Include their downline builders
        </label>
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
        >
          Apply
        </button>
        {allowed ? (
          <Link
            href={buildHref({ metric, range: rangeKey }, {})}
            className="text-xs text-mute hover:text-accent"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-card-hi text-left text-xs uppercase tracking-wide text-mute">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">{metricCfg.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.person_id} className="border-t border-hairline">
                <td className="px-4 py-3 text-mute">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/people/${r.person_id}`}
                    className="text-ink hover:text-accent"
                  >
                    {r.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-medium text-ink">
                  {fmt(r)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-mute" colSpan={3}>
                  No data in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
