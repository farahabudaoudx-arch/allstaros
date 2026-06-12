import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { adminSetRoleFlags } from "@/lib/actions/admin/people";
import { AddPeople } from "@/components/admin/AddPeople";

type Builder = { id: string; full_name: string; email: string; upline_id: string | null };

export default async function AdminBuildersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; skipped?: string; warn?: string; error?: string }>;
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
            : flash.ok === "deleted"
              ? "Person permanently deleted."
              : "Done."}
        </p>
      ) : null}
      {flash.warn ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
          {flash.warn}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      {/* Add builder */}
      <div className="mt-8">
        <AddPeople
          role="builder"
          uplines={builders}
          back="/admin/people/builders"
          allowBulk={false}
        />
      </div>

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
