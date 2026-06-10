import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import type { ScheduleRow } from "@/lib/producer/schedule";
import {
  adminCreateScheduleEvent,
  adminUpdateScheduleEvent,
  adminDeleteScheduleEvent,
} from "@/lib/actions/admin/schedule";

const FLASH: Record<string, string> = {
  created: "Event added.",
  updated: "Event saved.",
  deleted: "Event deleted.",
};

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("training_schedule")
    .select(
      "id, slug, title, host, initials, image, kicker, event_date, start_time, end_time, timezone, zoom_url, sort_order",
    )
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: true });
  const events = (data ?? []) as ScheduleRow[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Training Schedule
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Upcoming live trainings shown on the producer dashboard.
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

      {/* Add event */}
      <section className="mt-8 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Add event</h2>
        <form action={adminCreateScheduleEvent} className="mt-4">
          <EventFields />
          <button
            type="submit"
            className="mt-4 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
          >
            Add event
          </button>
        </form>
      </section>

      {/* Existing events */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">
          Scheduled ({events.length})
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {events.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-hairline bg-card p-5"
            >
              <form action={adminUpdateScheduleEvent}>
                <input type="hidden" name="id" value={e.id} />
                <EventFields row={e} />
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </form>
              <form action={adminDeleteScheduleEvent} className="mt-2">
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-4 py-2 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
          {events.length === 0 ? (
            <p className="text-sm text-mute">No events scheduled.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function EventFields({ row }: { row?: ScheduleRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field name="title" label="Title" defaultValue={row?.title ?? ""} />
      <Field name="host" label="Host" defaultValue={row?.host ?? ""} />
      <Field
        name="initials"
        label="Initials (auto if blank)"
        defaultValue={row?.initials ?? ""}
      />
      <Field
        name="event_date"
        label="Date"
        type="date"
        defaultValue={row?.event_date ?? ""}
      />
      <Field
        name="start_time"
        label="Start"
        type="time"
        defaultValue={(row?.start_time ?? "08:30").slice(0, 5)}
      />
      <Field
        name="end_time"
        label="End"
        type="time"
        defaultValue={(row?.end_time ?? "09:00").slice(0, 5)}
      />
      <Field
        name="kicker"
        label="Kicker (optional)"
        defaultValue={row?.kicker ?? ""}
      />
      <Field
        name="image"
        label="Image path (optional)"
        defaultValue={row?.image ?? ""}
      />
      <Field
        name="sort_order"
        label="Sort order"
        type="number"
        defaultValue={String(row?.sort_order ?? 0)}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Field
          name="zoom_url"
          label="Zoom URL (optional)"
          defaultValue={row?.zoom_url ?? ""}
        />
      </div>
      <Field
        name="timezone"
        label="Timezone"
        defaultValue={row?.timezone ?? "America/Chicago"}
      />
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
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
