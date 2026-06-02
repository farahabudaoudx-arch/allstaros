import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeLeaderboard } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";
import { money, num } from "@/lib/producer/format";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function fmtRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const f = new Date(`${from}T12:00:00Z`).toLocaleDateString("en-US", opts);
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("en-US", opts);
  return `${f} – ${t}`;
}

export default async function TeamPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/team");
  if (!person.is_builder) redirect("/producer");

  // Authed client → RLS scopes sales/policies/deposits to self + downline, so
  // this aggregates exactly the builder's team (unlike the org-wide leaderboard
  // which runs with the service-role client).
  const supabase = await createClient();
  const tz = safeTz(undefined, "America/New_York");
  const { range, rows } = await computeLeaderboard(supabase, {
    rangeKey: "mtd",
    tz,
    metric: "ap_cents",
  });

  const totals = rows.reduce(
    (a, r) => ({
      ap_cents: a.ap_cents + r.ap_cents,
      ip_cents: a.ip_cents + r.ip_cents,
      policies: a.policies + r.policies,
      sales: a.sales + r.sales,
    }),
    { ap_cents: 0, ip_cents: 0, policies: 0, sales: 0 },
  );

  const kpis = [
    { label: "Team AP", value: money(totals.ap_cents) },
    { label: "Issued AP", value: money(totals.ip_cents) },
    { label: "Policies", value: num(totals.policies) },
    { label: "Sales", value: num(totals.sales) },
    { label: "Producers", value: num(rows.length) },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Builder</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Team</h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Production across you and your downline · month to date ({fmtRange(range.from, range.to)}).
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-hairline bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">{k.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No team production yet this month.
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                <th className="px-5 py-3 font-normal">Producer</th>
                <th className="px-5 py-3 text-right font-normal">AP</th>
                <th className="hidden px-5 py-3 text-right font-normal sm:table-cell">Issued AP</th>
                <th className="hidden px-5 py-3 text-right font-normal md:table-cell">Policies</th>
                <th className="px-5 py-3 text-right font-normal">Sales</th>
                <th className="hidden px-5 py-3 text-right font-normal lg:table-cell">Deposits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isMe = row.person_id === person.id;
                return (
                  <tr
                    key={row.person_id}
                    className={`border-b border-hairline last:border-0 transition ${
                      isMe ? "bg-accent/[0.06]" : "hover:bg-card-hi/60"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                          {initials(row.full_name)}
                        </span>
                        <span className="truncate font-medium text-ink">
                          {row.full_name}
                          {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-accent">
                      {money(row.ap_cents)}
                    </td>
                    <td className="hidden px-5 py-3 text-right tabular-nums text-subtle sm:table-cell">
                      {money(row.ip_cents)}
                    </td>
                    <td className="hidden px-5 py-3 text-right tabular-nums text-subtle md:table-cell">
                      {num(row.policies)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-subtle">{num(row.sales)}</td>
                    <td className="hidden px-5 py-3 text-right tabular-nums text-subtle lg:table-cell">
                      {money(row.deposits_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
