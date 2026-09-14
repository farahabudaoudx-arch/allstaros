import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeDashboard } from "@/lib/producer/metrics";
import { money, num } from "@/lib/producer/format";
import { installationTimezone } from "@/lib/installation/runtime";

const TZ = installationTimezone();

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export default async function ReadOnlyPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: person } = await supabase
    .from("person")
    .select("id, full_name, email")
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  const [dash, goalRes] = await Promise.all([
    computeDashboard(supabase, id, { rangeKey: "mtd", tz: TZ }),
    supabase
      .from("producer_goal")
      .select("ap_cents, ip_cents, sales")
      .eq("person_id", id)
      .maybeSingle(),
  ]);
  const t = dash.totals;
  const goal = goalRes.data as
    | { ap_cents: number; ip_cents: number; sales: number }
    | null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link
        href={`/admin/people/${id}`}
        className="text-xs text-mute hover:text-accent"
      >
        ← {person.full_name as string}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Portal
        </h1>
        <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mute ring-1 ring-hairline">
          Read-only
        </span>
      </div>
      <p className="mt-2 text-sm text-subtle">
        {person.full_name as string}&apos;s month-to-date activity. Viewing only —
        no actions are taken as them.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">This month</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Dials" value={num(t.dials)} />
          <Stat label="Contacts" value={num(t.contacts)} />
          <Stat label="Appointments" value={num(t.appointments)} />
          <Stat label="Presentations" value={num(t.presentations)} />
          <Stat label="Sales" value={num(t.sales)} />
          <Stat label="Leads" value={num(t.leads)} />
          <Stat label="Annual Premium" value={money(t.ap_cents)} />
          <Stat label="Issued Premium" value={money(t.ip_cents)} />
        </div>
      </section>

      {goal ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Standing goals</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="AP goal" value={money(goal.ap_cents)} />
            <Stat label="IP goal" value={money(goal.ip_cents)} />
            <Stat label="Sales goal" value={num(goal.sales)} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
