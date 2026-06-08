import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

type Producer = {
  id: string;
  full_name: string;
  email: string;
  upline_id: string | null;
};

export default async function AdminProducersPage() {
  await requireAdmin();
  const supabase = await createClient();

  // Pure producers: producer flag set, but not builders (builders live on their
  // own page).
  const { data } = await supabase
    .from("person")
    .select("id, full_name, email, upline_id, is_builder, is_producer")
    .eq("is_producer", true)
    .eq("is_builder", false)
    .order("full_name", { ascending: true });
  const producers = (data ?? []) as Producer[];

  const uplineIds = [...new Set(producers.map((p) => p.upline_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (uplineIds.length > 0) {
    const { data: ups } = await supabase
      .from("person")
      .select("id, full_name")
      .in("id", uplineIds);
    for (const u of ups ?? []) nameById.set(u.id, u.full_name as string);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          People
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Producers
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {producers.length} producers. Open a profile to view activity, reassign
          upline, or view their portal.
        </p>
      </div>

      <section className="mt-8 flex flex-col gap-2">
        {producers.map((p) => (
          <Link
            key={p.id}
            href={`/admin/people/${p.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent hover:bg-card-hi"
          >
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">{p.full_name}</h3>
              <p className="mt-1 truncate text-sm text-subtle">{p.email}</p>
            </div>
            <p className="text-xs text-mute">
              Upline: {p.upline_id ? nameById.get(p.upline_id) ?? "—" : "—"}
            </p>
          </Link>
        ))}
        {producers.length === 0 ? (
          <p className="text-sm text-mute">No producers yet.</p>
        ) : null}
      </section>
    </main>
  );
}
