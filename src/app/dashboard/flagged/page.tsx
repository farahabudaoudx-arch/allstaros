import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeStalls } from "@/lib/actions/flagging";
import { phaseLabel, phaseStepLabel } from "@/lib/pipeline/labels";
import type { Person, Recruit } from "@/lib/db/types";
import { SectionHeading, Badge } from "@/components/ui";

type Row = Recruit & { person: Pick<Person, "full_name" | "email"> };

export default async function FlaggedPage() {
  // Refresh stall state on read so the view is always current.
  await computeStalls();

  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email)")
    .eq("flagged", true)
    .is("removed_at", null)
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <SectionHeading
        title="Flagged recruits"
      />
      <p className="mt-2 text-sm text-subtle">
        Removed recruits keep their history — nothing is deleted.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.16em] text-mute">
            <tr>
              <th className="px-4 py-3 font-normal">Recruit</th>
              <th className="px-4 py-3 font-normal">Phase</th>
              <th className="px-4 py-3 font-normal">Reason</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-subtle">
                  Nothing flagged. Quiet days are good days.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-card-hi">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">
                      {row.person.full_name}
                    </div>
                    <div className="text-xs text-mute">{row.person.email}</div>
                  </td>
                  <td className="px-4 py-3 text-subtle">
                    {phaseLabel(row.phase)} · {phaseStepLabel(row.phase_step)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="warn">{row.flag_reason ?? "stalled"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/recruits/${row.id}`}
                      className="text-sm font-medium text-accent hover:text-accent-soft"
                    >
                      Decide →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
