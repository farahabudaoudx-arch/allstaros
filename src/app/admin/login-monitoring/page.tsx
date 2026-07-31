import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

type LoginEvent = {
  id: string;
  person_id: string;
  ip: string | null;
  user_agent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  flagged: boolean;
  logged_in_at: string;
};

function locationOf(e: LoginEvent): string {
  const parts = [e.city, e.region, e.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Unknown location";
}

function when(iso: string): string {
  // Stable, locale-independent rendering to avoid hydration drift.
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}

function EventRow({
  e,
  name,
}: {
  e: LoginEvent;
  name: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        e.flagged ? "border-red-500/40 bg-red-500/5" : "border-hairline bg-card-hi"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {name}
          {e.flagged ? (
            <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
              New location
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-subtle">
          {locationOf(e)} · {e.ip ?? "no ip"}
        </p>
      </div>
      <p className="text-xs text-mute">{when(e.logged_in_at)}</p>
    </div>
  );
}

export default async function AdminLoginMonitoringPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: eventData } = await supabase
    .from("login_event")
    .select(
      "id, person_id, ip, user_agent, city, region, country, flagged, logged_in_at",
    )
    .order("logged_in_at", { ascending: false })
    .limit(300);
  const events = (eventData ?? []) as LoginEvent[];

  const personIds = [...new Set(events.map((e) => e.person_id))];
  const nameById = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("person")
      .select("id, full_name")
      .in("id", personIds);
    for (const p of people ?? []) nameById.set(p.id, p.full_name as string);
  }

  const flagged = events.filter((e) => e.flagged);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Login Monitoring
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Sign-ins from a new location are auto-flagged — a quick account-sharing
          signal. Showing the most recent {events.length}.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">
          Flagged ({flagged.length})
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {flagged.map((e) => (
            <EventRow key={e.id} e={e} name={nameById.get(e.person_id) ?? "Unknown"} />
          ))}
          {flagged.length === 0 ? (
            <p className="text-sm text-mute">No flagged sign-ins.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Recent sign-ins</h2>
        <div className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <EventRow key={e.id} e={e} name={nameById.get(e.person_id) ?? "Unknown"} />
          ))}
          {events.length === 0 ? (
            <p className="text-sm text-mute">
              No sign-ins recorded yet. Events appear here as users log in.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
