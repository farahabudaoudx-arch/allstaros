import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { adminUpsertGoal } from "@/lib/actions/admin/goals";

type Producer = {
  id: string;
  full_name: string;
  is_builder: boolean;
};

type Goal = {
  person_id: string;
  ap_cents: number;
  ip_cents: number;
  sales: number;
};

export default async function AdminGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const [{ data: peopleData }, { data: goalData }] = await Promise.all([
    supabase
      .from("person")
      .select("id, full_name, is_builder, is_producer")
      .or("is_producer.eq.true,is_builder.eq.true")
      .order("full_name", { ascending: true }),
    supabase.from("producer_goal").select("person_id, ap_cents, ip_cents, sales"),
  ]);

  const producers = (peopleData ?? []) as Producer[];
  const goalByPerson = new Map(
    ((goalData ?? []) as Goal[]).map((g) => [g.person_id, g]),
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Goals
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Standing AP / IP and sales targets per producer. Amounts in dollars.
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          Goal saved.
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {producers.map((p) => {
          const g = goalByPerson.get(p.id);
          const ap = g ? (g.ap_cents / 100).toString() : "";
          const ip = g ? (g.ip_cents / 100).toString() : "";
          const sales = g ? g.sales.toString() : "";
          return (
            <form
              key={p.id}
              action={adminUpsertGoal}
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-hairline bg-card p-5"
            >
              <input type="hidden" name="personId" value={p.id} />
              <div className="min-w-[180px] flex-1">
                <h3 className="text-base font-semibold text-ink">
                  {p.full_name}
                </h3>
                <p className="text-xs text-mute">
                  {p.is_builder ? "Builder" : "Producer"}
                </p>
              </div>
              <GoalField name="ap" label="AP goal ($)" defaultValue={ap} />
              <GoalField name="ip" label="IP goal ($)" defaultValue={ip} />
              <GoalField name="sales" label="Sales goal" defaultValue={sales} />
              <button
                type="submit"
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
              >
                Save
              </button>
            </form>
          );
        })}
        {producers.length === 0 ? (
          <p className="text-sm text-mute">No producers yet.</p>
        ) : null}
      </div>
    </main>
  );
}

function GoalField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="flex w-28 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
        {label}
      </span>
      <input
        name={name}
        type="number"
        min="0"
        step="any"
        defaultValue={defaultValue}
        placeholder="0"
        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
