import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import {
  adminSetFlag,
  adminSetPhase,
  adminRemoveRecruit,
  adminRestoreRecruit,
} from "@/lib/actions/admin/recruits";
import { PHASES } from "@/lib/db/types";

type RecruitRow = {
  id: string;
  person_id: string;
  builder_id: string;
  phase: string;
  phase_step: string | null;
  flagged: boolean;
  flag_reason: string | null;
  removed_at: string | null;
};

const FLASH: Record<string, string> = {
  flag: "Flag updated.",
  phase: "Phase updated.",
  removed: "Recruit removed.",
  restored: "Recruit restored.",
};

export default async function AdminRecruitsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const [{ data: recruitData }, { data: personData }] = await Promise.all([
    supabase
      .from("recruit")
      .select(
        "id, person_id, builder_id, phase, phase_step, flagged, flag_reason, removed_at",
      ),
    supabase.from("person").select("id, full_name, email"),
  ]);

  const recruits = (recruitData ?? []) as RecruitRow[];
  const nameById = new Map(
    (personData ?? []).map((p) => [p.id, p as { full_name: string; email: string }]),
  );

  // Flagged first, then active before removed, then by name.
  recruits.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    const aRemoved = !!a.removed_at;
    const bRemoved = !!b.removed_at;
    if (aRemoved !== bRemoved) return aRemoved ? 1 : -1;
    const an = nameById.get(a.person_id)?.full_name ?? "";
    const bn = nameById.get(b.person_id)?.full_name ?? "";
    return an.localeCompare(bn);
  });

  const flaggedCount = recruits.filter((r) => r.flagged).length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Recruits
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {recruits.length} recruits · {flaggedCount} flagged.
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {FLASH[flash.ok] ?? "Done."}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {recruits.map((r) => {
          const person = nameById.get(r.person_id);
          const builder = nameById.get(r.builder_id);
          const removed = !!r.removed_at;
          return (
            <div
              key={r.id}
              className={`rounded-2xl border bg-card p-5 ${
                r.flagged ? "border-red-500/40" : "border-hairline"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">
                      {person?.full_name ?? "Unknown"}
                    </h3>
                    <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
                      {r.phase}
                      {r.phase_step ? ` · ${r.phase_step}` : ""}
                    </span>
                    {r.flagged ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
                        Flagged
                      </span>
                    ) : null}
                    {removed ? (
                      <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mute ring-1 ring-hairline">
                        Removed
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-subtle">
                    {person?.email ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    Builder: {builder?.full_name ?? "—"}
                    {r.flag_reason ? ` · Flag: ${r.flag_reason}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {removed ? (
                    <form action={adminRestoreRecruit}>
                      <input type="hidden" name="recruitId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                      >
                        Restore
                      </button>
                    </form>
                  ) : (
                    <form action={adminRemoveRecruit}>
                      <input type="hidden" name="recruitId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 border-t border-hairline pt-3 md:grid-cols-2">
                {/* Flag / unflag */}
                <form action={adminSetFlag} className="flex items-end gap-2">
                  <input type="hidden" name="recruitId" value={r.id} />
                  <input
                    type="hidden"
                    name="flagged"
                    value={r.flagged ? "false" : "true"}
                  />
                  {!r.flagged ? (
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                        Flag reason
                      </span>
                      <input
                        name="reason"
                        placeholder="Why flag this recruit?"
                        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                  ) : null}
                  <button
                    type="submit"
                    className="rounded-full border border-hairline px-3 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                  >
                    {r.flagged ? "Unflag" : "Flag"}
                  </button>
                </form>

                {/* Phase correction */}
                <form action={adminSetPhase} className="flex items-end gap-2">
                  <input type="hidden" name="recruitId" value={r.id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                      Phase
                    </span>
                    <select
                      name="phase"
                      defaultValue={r.phase}
                      className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    >
                      {PHASES.map((ph) => (
                        <option key={ph} value={ph}>
                          {ph}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                      Step (optional)
                    </span>
                    <input
                      name="phase_step"
                      defaultValue={r.phase_step ?? ""}
                      placeholder="e.g. exam_passed"
                      className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                  >
                    Set
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
