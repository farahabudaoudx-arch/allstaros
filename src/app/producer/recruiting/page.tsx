import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateReferralCode } from "@/lib/referral";
import { PHASES, type Person, type Recruit } from "@/lib/db/types";
import { phaseLabel, phaseStepLabel } from "@/lib/pipeline/labels";
import { Badge } from "@/components/ui";
import { CopyLink } from "./CopyLink";

type Row = Recruit & { person: Pick<Person, "full_name" | "email" | "status"> };

export default async function RecruitingPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/recruiting");
  if (!person.is_builder) redirect("/producer");

  // RLS scopes the recruit table to this builder's downline.
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .is("removed_at", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  const counts = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<string, number>;
  for (const r of rows) counts[r.phase] = (counts[r.phase] ?? 0) + 1;

  // This builder's personal signup link. Anyone who joins through it lands in
  // this builder's downline.
  const code = await getOrCreateReferralCode(person.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupUrl = code ? `${appUrl}/join/${code}` : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Builder</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Recruiting</h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Where everyone in your downline sits in the recruiting pipeline.
        </p>
      </div>

      {/* Personal signup link */}
      {signupUrl ? (
        <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/[0.05] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                Your signup link
              </p>
              <p className="mt-1.5 text-sm text-subtle">
                Share this link to recruit directly. Everyone who joins through it is added to
                your team.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <CopyLink url={signupUrl} />
          </div>
        </div>
      ) : null}

      {/* Pipeline funnel */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PHASES.map((p) => (
          <div key={p} className="rounded-2xl border border-hairline bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
              {phaseLabel(p).split(" — ")[0]}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{counts[p] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Roster */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            <tr>
              <th className="px-5 py-3 font-normal">Recruit</th>
              <th className="px-5 py-3 font-normal">Phase</th>
              <th className="hidden px-5 py-3 font-normal md:table-cell">Step</th>
              <th className="px-5 py-3 font-normal">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-subtle">
                  No recruits in your downline yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-card-hi/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{row.person.full_name}</div>
                    <div className="text-xs text-mute">{row.person.email}</div>
                  </td>
                  <td className="px-5 py-3 text-subtle">{phaseLabel(row.phase)}</td>
                  <td className="hidden px-5 py-3 text-subtle md:table-cell">
                    {phaseStepLabel(row.phase_step)}
                  </td>
                  <td className="px-5 py-3">
                    {row.flagged ? (
                      <Badge tone="warn">{row.flag_reason ?? "Flagged"}</Badge>
                    ) : (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
