import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

type RecruitRow = {
  id: string;
  person_id: string;
  phase: string;
  phase_step: string | null;
  flagged: boolean;
  removed_at: string | null;
};

export default async function AdminRecruitsListPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: recruitData }, { data: personData }] = await Promise.all([
    supabase
      .from("recruit")
      .select("id, person_id, phase, phase_step, flagged, removed_at"),
    supabase.from("person").select("id, full_name, email"),
  ]);

  const recruits = (recruitData ?? []) as RecruitRow[];
  const nameById = new Map(
    (personData ?? []).map((p) => [p.id, p as { full_name: string; email: string }]),
  );

  recruits.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    const an = nameById.get(a.person_id)?.full_name ?? "";
    const bn = nameById.get(b.person_id)?.full_name ?? "";
    return an.localeCompare(bn);
  });

  const flaggedCount = recruits.filter((r) => r.flagged).length;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          People
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Recruits
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {recruits.length} recruits · {flaggedCount} flagged. Open a profile to
          reassign upline, reset their portal, or change their step.
        </p>
      </div>

      <section className="mt-8 flex flex-col gap-2">
        {recruits.map((r) => {
          const person = nameById.get(r.person_id);
          return (
            <Link
              key={r.id}
              href={`/admin/people/${r.person_id}`}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 transition hover:bg-card-hi ${
                r.flagged ? "border-red-500/40 hover:border-red-500/60" : "border-hairline hover:border-accent"
              }`}
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">
                  {person?.full_name ?? "Unknown"}
                </h3>
                <p className="mt-1 truncate text-sm text-subtle">
                  {person?.email ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
                  {r.phase}
                  {r.phase_step ? ` · ${r.phase_step}` : ""}
                </span>
                {r.flagged ? (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
                    Flagged
                  </span>
                ) : null}
                {r.removed_at ? (
                  <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mute ring-1 ring-hairline">
                    Removed
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
        {recruits.length === 0 ? (
          <p className="text-sm text-mute">No recruits yet.</p>
        ) : null}
      </section>
    </main>
  );
}
