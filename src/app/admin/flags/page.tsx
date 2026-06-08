import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { adminSetFlag } from "@/lib/actions/admin/recruits";

type FlaggedRow = {
  id: string;
  person_id: string;
  phase: string;
  phase_step: string | null;
  flag_reason: string | null;
};

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const { data: flaggedData } = await supabase
    .from("recruit")
    .select("id, person_id, phase, phase_step, flag_reason")
    .eq("flagged", true)
    .is("removed_at", null);
  const flagged = (flaggedData ?? []) as FlaggedRow[];

  const personIds = [...new Set(flagged.map((f) => f.person_id))];
  const nameById = new Map<string, { full_name: string; email: string }>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("person")
      .select("id, full_name, email")
      .in("id", personIds);
    for (const p of people ?? [])
      nameById.set(p.id, { full_name: p.full_name as string, email: p.email as string });
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Performance
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Flags
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {flagged.length} flagged recruit{flagged.length === 1 ? "" : "s"} across
          the organization.
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          Flag cleared.
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <section className="mt-8 flex flex-col gap-2">
        {flagged.map((f) => {
          const person = nameById.get(f.person_id);
          return (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-5"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/people/${f.person_id}`}
                  className="text-base font-semibold text-ink hover:text-accent"
                >
                  {person?.full_name ?? "Unknown"}
                </Link>
                <p className="mt-1 text-sm text-subtle">
                  {f.flag_reason ?? "No reason given"}
                </p>
                <p className="mt-0.5 text-xs text-mute">
                  {f.phase}
                  {f.phase_step ? ` · ${f.phase_step}` : ""}
                </p>
              </div>
              <form action={adminSetFlag}>
                <input type="hidden" name="recruitId" value={f.id} />
                <input type="hidden" name="flagged" value="false" />
                <input type="hidden" name="back" value="/admin/flags" />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  Unflag
                </button>
              </form>
            </div>
          );
        })}
        {flagged.length === 0 ? (
          <p className="text-sm text-mute">Nothing flagged. 🎉</p>
        ) : null}
      </section>
    </main>
  );
}
