import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import type { TrainingContentRow } from "@/lib/producer/training-content";
import {
  adminCreateContent,
  adminDeleteContent,
} from "@/lib/actions/admin/training-content";
import {
  adminCreateLesson,
  adminDeleteLesson,
} from "@/lib/actions/admin/lessons";

const FLASH: Record<string, string> = {
  created: "Video added.",
  deleted: "Video removed.",
  lesson: "Recruit lesson added.",
  lessonDeleted: "Recruit lesson removed.",
};

// Libraries backed by training_content (flat Bunny-embed lists).
const CONTENT_LIBS: Array<{ key: string; label: string; note?: string }> = [
  { key: "bootcamp", label: "Bootcamp" },
  { key: "accelerator", label: "Accelerator" },
  { key: "uplevel", label: "Uplevel" },
  {
    key: "live",
    label: "Live Trainings",
    note: "Falls back to the Bunny live library when empty.",
  },
];

type Lesson = {
  id: string;
  title: string;
  video_url: string | null;
  phase: string;
  sort_order: number;
  is_assignment: boolean;
};

export default async function AdminTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const [{ data: contentData }, { data: lessonData }] = await Promise.all([
    supabase
      .from("training_content")
      .select("id, library, title, embed_url, sort_order")
      .order("library", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("training_lesson")
      .select("id, title, video_url, phase, sort_order, is_assignment")
      .order("phase", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  const content = (contentData ?? []) as TrainingContentRow[];
  const lessons = (lessonData ?? []) as Lesson[];

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
          Bootcamp, Accelerator, Uplevel and Live take a Bunny embed URL. The
          Recruit library is the recruit portal&apos;s own lesson list.
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
        {CONTENT_LIBS.map((lib) => {
          const rows = content.filter((r) => r.library === lib.key);
          return (
            <section
              key={lib.key}
              className="rounded-2xl border border-hairline bg-card p-5"
            >
              <h2 className="text-lg font-semibold text-ink">{lib.label}</h2>
              {lib.note ? (
                <p className="mt-1 text-xs text-mute">{lib.note}</p>
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
                    No videos yet
                    {lib.key === "live"
                      ? " — pulling from Bunny."
                      : " — the page falls back to the built-in catalog."}
                  </p>
                ) : null}
              </div>

              <form
                action={adminCreateContent}
                className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end"
              >
                <input type="hidden" name="library" value={lib.key} />
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

        {/* Recruit library — training_lesson rows (the recruit portal's lessons) */}
        <section className="rounded-2xl border border-hairline bg-card p-5">
          <h2 className="text-lg font-semibold text-ink">Recruit Library</h2>
          <p className="mt-1 text-xs text-mute">
            The licensing &amp; onboarding lessons recruits see in their portal.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {lessons.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-card-hi px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {l.title}
                    {l.is_assignment ? (
                      <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-[10px] uppercase tracking-wide text-mute ring-1 ring-hairline">
                        Assignment
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-xs text-mute">
                    {l.phase} · {l.video_url ?? "no video"}
                  </p>
                </div>
                <form action={adminDeleteLesson}>
                  <input type="hidden" name="id" value={l.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              </div>
            ))}
            {lessons.length === 0 ? (
              <p className="text-xs text-mute">No recruit lessons yet.</p>
            ) : null}
          </div>

          <form
            action={adminCreateLesson}
            className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2"
          >
            <Field name="title" label="Title" />
            <Field name="video_url" label="Video URL (Bunny embed)" />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                Phase
              </span>
              <select
                name="phase"
                defaultValue="licensing"
                className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="licensing">Licensing</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </label>
            <Field name="sort_order" label="Order" type="number" defaultValue="0" />
            <label className="flex items-center gap-2 text-sm text-subtle">
              <input type="checkbox" name="is_assignment" />
              Counts as a required assignment
            </label>
            <div>
              <button
                type="submit"
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
              >
                Add lesson
              </button>
            </div>
          </form>
        </section>
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
