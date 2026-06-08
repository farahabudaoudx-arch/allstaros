import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_LIBRARIES,
  type TrainingContentRow,
} from "@/lib/producer/training-content";
import {
  adminCreateContent,
  adminDeleteContent,
} from "@/lib/actions/admin/training-content";

const FLASH: Record<string, string> = {
  created: "Video added.",
  deleted: "Video removed.",
};

const LIBRARY_LABEL: Record<string, string> = {
  bootcamp: "Bootcamp",
  accelerator: "Accelerator",
  uplevel: "Uplevel",
  recruit: "Recruit Library",
  live: "Live Trainings",
};

const LIBRARY_NOTE: Record<string, string> = {
  recruit: "Note: the recruit portal also pulls its Bunny library directly.",
  live: "Note: the live page pulls the Bunny live library directly.",
};

export default async function AdminTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_content")
    .select("id, library, title, embed_url, sort_order")
    .order("library", { ascending: true })
    .order("sort_order", { ascending: true });
  const all = (data ?? []) as TrainingContentRow[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Training Content
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Add or remove videos per library. Paste a Bunny Stream embed URL. Each
          library renders as an ordered flat list.
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

      <div className="mt-8 flex flex-col gap-8">
        {ALL_LIBRARIES.map((lib) => {
          const rows = all.filter((r) => r.library === lib);
          return (
            <section
              key={lib}
              className="rounded-2xl border border-hairline bg-card p-5"
            >
              <h2 className="text-lg font-semibold text-ink">
                {LIBRARY_LABEL[lib] ?? lib}
              </h2>
              {LIBRARY_NOTE[lib] ? (
                <p className="mt-1 text-xs text-mute">{LIBRARY_NOTE[lib]}</p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-card-hi px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.sort_order}. {r.title}
                      </p>
                      <p className="truncate font-mono text-xs text-mute">
                        {r.embed_url}
                      </p>
                    </div>
                    <form action={adminDeleteContent}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                ))}
                {rows.length === 0 ? (
                  <p className="text-xs text-mute">
                    No videos yet — the page falls back to the built-in catalog.
                  </p>
                ) : null}
              </div>

              <form
                action={adminCreateContent}
                className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end"
              >
                <input type="hidden" name="library" value={lib} />
                <Field name="title" label="Title" />
                <Field name="embed_url" label="Bunny embed URL" />
                <Field name="sort_order" label="Order" type="number" defaultValue="0" />
                <button
                  type="submit"
                  className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                >
                  Add
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue = "",
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
