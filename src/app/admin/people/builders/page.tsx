import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { adminSetRoleFlags } from "@/lib/actions/admin/people";
import { adminBulkInvite } from "@/lib/actions/admin/team";

type Builder = { id: string; full_name: string; email: string; upline_id: string | null };

export default async function AdminBuildersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; skipped?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("person")
    .select("id, full_name, email, upline_id")
    .eq("is_builder", true)
    .order("full_name", { ascending: true });
  const builders = (data ?? []) as Builder[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          People
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Builders
        </h1>
        <p className="mt-3 text-sm text-subtle">{builders.length} builders.</p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {flash.skipped !== undefined
            ? `Invited ${flash.ok}, skipped ${flash.skipped}.`
            : "Done."}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      {/* Bulk add + invite a downline */}
      <section className="mt-8 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Bulk add &amp; invite</h2>
        <p className="mt-1 text-sm text-subtle">
          Paste one person per line — <span className="font-mono text-xs">Name, email</span>{" "}
          or <span className="font-mono text-xs">Name &lt;email&gt;</span>. Pick an
          upline and a role for the whole batch; everyone gets an invite email.
        </p>
        <form action={adminBulkInvite} className="mt-4 flex flex-col gap-3">
          <textarea
            name="roster"
            rows={6}
            placeholder={"Jane Doe, jane@example.com\nJohn Smith <john@example.com>"}
            className="w-full rounded-lg border border-hairline bg-card-hi px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                Upline
              </span>
              <select
                name="uplineId"
                className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">— none —</option>
                {builders.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                Role
              </span>
              <select
                name="role"
                defaultValue="recruit"
                className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="recruit">Recruit</option>
                <option value="producer">Producer</option>
                <option value="builder">Builder</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
            >
              Add &amp; send invites
            </button>
          </div>
        </form>
      </section>

      {/* Builder roster */}
      <section className="mt-10 flex flex-col gap-2">
        {builders.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-card p-5"
          >
            <Link href={`/admin/people/${b.id}`} className="min-w-0 group">
              <h3 className="text-base font-semibold text-ink group-hover:text-accent">
                {b.full_name}
              </h3>
              <p className="mt-1 truncate text-sm text-subtle">{b.email}</p>
            </Link>
            <form action={adminSetRoleFlags}>
              <input type="hidden" name="personId" value={b.id} />
              <input type="hidden" name="role" value="builder" />
              <input type="hidden" name="next" value="false" />
              <button
                type="submit"
                className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
              >
                Remove builder
              </button>
            </form>
          </div>
        ))}
        {builders.length === 0 ? (
          <p className="text-sm text-mute">No builders yet.</p>
        ) : null}
      </section>
    </main>
  );
}
