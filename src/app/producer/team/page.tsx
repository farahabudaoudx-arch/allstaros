import Link from "next/link";
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
    { label: "Policies", value: num(totals.policies) },
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

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
          {rows.map((row) => {
            const isMe = row.person_id === person.id;
            return (
              <li key={row.person_id}>
                <Link
                  href={`/producer/team/${row.person_id}`}
                  className={`flex items-center gap-4 px-5 py-4 transition ${
                    isMe ? "bg-accent/[0.06] hover:bg-accent/[0.1]" : "hover:bg-card-hi/60"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                    {initials(row.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">
                      {row.full_name}
                      {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                      {num(row.policies)} policies · {num(row.sales)} sales
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums text-accent">{money(row.ap_cents)}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">AP</div>
                  </div>
                  <span className="shrink-0 text-mute" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
