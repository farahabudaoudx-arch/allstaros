import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { adminReassignUpline } from "@/lib/actions/admin/team";
import {
  adminSetFlag,
  adminSetPhase,
  adminRemoveRecruit,
  adminRestoreRecruit,
  adminResetRecruitPortal,
} from "@/lib/actions/admin/recruits";
import { PHASES } from "@/lib/db/types";

type PersonRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  upline_id: string | null;
  is_builder: boolean;
  is_producer: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  is_owner: boolean;
  status: string;
};

type RecruitRow = {
  id: string;
  phase: string;
  phase_step: string | null;
  flagged: boolean;
  flag_reason: string | null;
  removed_at: string | null;
};

const FLASH: Record<string, string> = {
  upline: "Upline reassigned.",
  flag: "Flag updated.",
  phase: "Phase updated.",
  removed: "Recruit removed.",
  restored: "Recruit restored.",
  reset: "Portal reset to the start of licensing.",
  role: "Role updated.",
  status: "Status updated.",
  profile: "Profile saved.",
};

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
      {label}
    </span>
  );
}

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;
  const supabase = await createClient();
  const back = `/admin/people/${id}`;

  const { data: personData } = await supabase
    .from("person")
    .select(
      "id, full_name, email, phone, upline_id, is_builder, is_producer, is_admin, is_super_admin, is_owner, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!personData) notFound();
  const person = personData as PersonRow;

  // Upline chain: upline, then upline's upline (names only — no activity).
  const chain: { id: string; full_name: string }[] = [];
  let cursor = person.upline_id;
  for (let i = 0; i < 2 && cursor; i++) {
    const { data: up } = await supabase
      .from("person")
      .select("id, full_name, upline_id")
      .eq("id", cursor)
      .maybeSingle();
    if (!up) break;
    chain.push({ id: up.id, full_name: up.full_name as string });
    cursor = (up.upline_id as string | null) ?? null;
  }

  // Direct downline (with their roles, links to their full data).
  const { data: downlineData } = await supabase
    .from("person")
    .select("id, full_name, email, is_builder, is_producer")
    .eq("upline_id", id)
    .order("full_name", { ascending: true });
  const downline = (downlineData ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    is_builder: boolean;
    is_producer: boolean;
  }>;

  // Recruit row, if any.
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("id, phase, phase_step, flagged, flag_reason, removed_at")
    .eq("person_id", id)
    .maybeSingle();
  const recruit = recruitData as RecruitRow | null;

  // Builder options for the reassign-upline picker.
  const { data: builderData } = await supabase
    .from("person")
    .select("id, full_name")
    .eq("is_builder", true)
    .order("full_name", { ascending: true });
  const builders = (builderData ?? []) as { id: string; full_name: string }[];

  const roleLabel = person.is_builder
    ? "Builder"
    : person.is_producer
      ? "Producer"
      : recruit
        ? "Recruit"
        : "Person";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link href="/admin/people/builders" className="text-xs text-mute hover:text-accent">
        ← People
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          {person.full_name}
        </h1>
        {person.is_owner ? <Badge label="Owner" /> : null}
        {person.is_super_admin ? <Badge label="Super Admin" /> : null}
        {person.is_admin && !person.is_super_admin ? <Badge label="Admin" /> : null}
        <Badge label={roleLabel} />
        {person.status === "removed" ? (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
            Removed
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-subtle">
        {person.email}
        {person.phone ? ` · ${person.phone}` : ""}
      </p>

      {person.is_producer ? (
        <Link
          href={`/admin/people/${id}/portal`}
          className="mt-4 inline-block rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent"
        >
          View portal (read-only) →
        </Link>
      ) : null}

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

      {/* Upline chain */}
      <section className="mt-8 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">Upline</h2>
        {chain.length === 0 ? (
          <p className="mt-2 text-sm text-mute">Top of the tree — no upline.</p>
        ) : (
          <p className="mt-2 text-sm text-subtle">
            {chain.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? " → " : ""}
                <Link href={`/admin/people/${c.id}`} className="text-ink hover:text-accent">
                  {c.full_name}
                </Link>
                {i === 0 ? " (direct)" : " (upline's upline)"}
              </span>
            ))}
          </p>
        )}
        <p className="mt-2 text-xs text-mute">
          You can see who they roll up to, but not the upline&apos;s own activity.
        </p>
      </section>

      {/* Reassign upline */}
      <section className="mt-4 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">Reassign upline</h2>
        <form action={adminReassignUpline} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="personId" value={id} />
          <input type="hidden" name="back" value={back} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
              New upline
            </span>
            <select
              name="uplineId"
              defaultValue={person.upline_id ?? ""}
              className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">— none —</option>
              {builders
                .filter((b) => b.id !== id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
          >
            Reassign
          </button>
        </form>
      </section>

      {/* Recruit controls */}
      {recruit ? (
        <section className="mt-4 rounded-2xl border border-hairline bg-card p-5">
          <h2 className="text-sm font-semibold text-ink">Recruit controls</h2>
          <p className="mt-1 text-xs text-mute">
            Phase: {recruit.phase}
            {recruit.phase_step ? ` · ${recruit.phase_step}` : ""}
            {recruit.flagged ? " · flagged" : ""}
          </p>

          <form action={adminSetPhase} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="recruitId" value={recruit.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                Phase
              </span>
              <select
                name="phase"
                defaultValue={recruit.phase}
                className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                {PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                Step
              </span>
              <input
                name="phase_step"
                defaultValue={recruit.phase_step ?? ""}
                placeholder="e.g. exam_passed"
                className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
            >
              Set step
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={adminResetRecruitPortal}>
              <input type="hidden" name="personId" value={id} />
              <input type="hidden" name="back" value={back} />
              <button
                type="submit"
                className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                Reset portal
              </button>
            </form>
            <form action={adminSetFlag}>
              <input type="hidden" name="recruitId" value={recruit.id} />
              <input type="hidden" name="flagged" value={recruit.flagged ? "false" : "true"} />
              {!recruit.flagged ? (
                <input type="hidden" name="reason" value="flagged by admin" />
              ) : null}
              <button
                type="submit"
                className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                {recruit.flagged ? "Unflag" : "Flag"}
              </button>
            </form>
            {recruit.removed_at ? (
              <form action={adminRestoreRecruit}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  Restore
                </button>
              </form>
            ) : (
              <form action={adminRemoveRecruit}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                >
                  Remove
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}

      {/* Downline */}
      <section className="mt-4 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">
          Downline ({downline.length})
        </h2>
        <p className="mt-1 text-xs text-mute">
          Everyone directly under {person.full_name}. Open anyone to see their full data.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {downline.map((d) => (
            <Link
              key={d.id}
              href={`/admin/people/${d.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-card-hi px-4 py-2.5 transition hover:border-accent"
            >
              <span className="text-sm text-ink">{d.full_name}</span>
              <span className="text-xs text-mute">
                {d.is_builder ? "Builder" : d.is_producer ? "Producer" : "Recruit"}
              </span>
            </Link>
          ))}
          {downline.length === 0 ? (
            <p className="text-sm text-mute">No one in their downline.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
