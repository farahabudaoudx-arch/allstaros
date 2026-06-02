import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeStalls } from "@/lib/actions/flagging";
import { phaseLabel, phaseStepLabel } from "@/lib/pipeline/labels";
import { STALL_LAPSE_DAYS } from "@/lib/db/types";
import type { CheckIn, Recruit, Person } from "@/lib/db/types";
import { SectionHeading, LinkButton, Badge } from "@/components/ui";

type Row = Recruit & { person: Pick<Person, "full_name" | "email" | "status"> };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  // Refresh stall flags on every dashboard load so the roster is current.
  await computeStalls();

  const supabase = await createClient();
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .order("created_at", { ascending: false });

  const rows = (recruitData ?? []) as unknown as Row[];

  // Fetch latest check-in per recruit (one query, group client-side).
  const recruitIds = rows.map((r) => r.id);
  const checkInMap = new Map<string, string>();
  if (recruitIds.length > 0) {
    const { data: checkInData } = await supabase
      .from("check_in")
      .select("recruit_id, check_in_date")
      .in("recruit_id", recruitIds)
      .order("check_in_date", { ascending: false });
    for (const c of (checkInData ?? []) as Pick<
      CheckIn,
      "recruit_id" | "check_in_date"
    >[]) {
      if (!checkInMap.has(c.recruit_id)) {
        checkInMap.set(c.recruit_id, c.check_in_date);
      }
    }
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <SectionHeading
        kicker="Visibility — your downline only"
        title="Downline roster"
        right={
          <LinkButton href="/dashboard/recruits/new" variant="primary">
            Mark interview passed
          </LinkButton>
        }
      />

      {params.created ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Recruit created — they can sign in with the email you provided.
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            <tr>
              <th className="px-4 py-3 font-normal">Recruit</th>
              <th className="px-4 py-3 font-normal">Phase</th>
              <th className="px-4 py-3 font-normal">Step</th>
              <th className="px-4 py-3 font-normal">Last check-in</th>
              <th className="px-4 py-3 font-normal">Flag</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-subtle">
                  No recruits yet. Use{" "}
                  <span className="text-ink">Mark interview passed</span> to
                  start one.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const lastCheckIn = checkInMap.get(row.id);
                const lapse = lastCheckIn
                  ? Math.floor(
                      (new Date(today).getTime() -
                        new Date(lastCheckIn).getTime()) /
                        (24 * 60 * 60 * 1000),
                    )
                  : null;
                const stale = lapse !== null && lapse > STALL_LAPSE_DAYS;
                const removed =
                  row.person.status === "removed" || row.removed_at;
                return (
                  <tr
                    key={row.id}
                    className={
                      removed ? "opacity-40" : "transition hover:bg-card-hi"
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {row.person.full_name}
                      </div>
                      <div className="text-xs text-mute">
                        {row.person.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-subtle">
                      {phaseLabel(row.phase)}
                    </td>
                    <td className="px-4 py-3 text-subtle">
                      {phaseStepLabel(row.phase_step)}
                    </td>
                    <td className="px-4 py-3">
                      {lastCheckIn ? (
                        <span className={stale ? "text-warn" : "text-subtle"}>
                          {lastCheckIn} {lapse !== null ? `(${lapse}d)` : ""}
                        </span>
                      ) : (
                        <span className="text-mute">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.flagged ? (
                        <Badge tone="warn">{row.flag_reason ?? "Flagged"}</Badge>
                      ) : (
                        <span className="text-mute">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/recruits/${row.id}`}
                        className="text-sm font-medium text-accent hover:text-accent-soft"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
