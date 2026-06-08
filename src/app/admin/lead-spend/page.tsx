import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import type { LeadPurchase } from "@/lib/lead-spend/types";

type Rollup = {
  personId: string;
  name: string;
  spend: number;
  leads: number;
};

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function AdminLeadSpendPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: purchaseData }, { data: personData }] = await Promise.all([
    supabase
      .from("lead_purchases")
      .select(
        "id, person_id, vendor, amount, lead_count, lead_type, purchase_date",
      )
      .order("purchase_date", { ascending: false }),
    supabase.from("person").select("id, full_name"),
  ]);

  const purchases = (purchaseData ?? []) as LeadPurchase[];
  const nameById = new Map(
    (personData ?? []).map((p) => [p.id, p.full_name as string]),
  );

  const totalSpend = purchases.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalLeads = purchases.reduce((s, p) => s + Number(p.lead_count || 0), 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  // Per-producer rollup.
  const byPerson = new Map<string, Rollup>();
  for (const p of purchases) {
    const r =
      byPerson.get(p.person_id) ??
      ({
        personId: p.person_id,
        name: nameById.get(p.person_id) ?? "Unknown",
        spend: 0,
        leads: 0,
      } as Rollup);
    r.spend += Number(p.amount || 0);
    r.leads += Number(p.lead_count || 0);
    byPerson.set(p.person_id, r);
  }
  const rollups = [...byPerson.values()].sort((a, b) => b.spend - a.spend);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
            Admin
          </p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
            Lead Spend
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Every producer&apos;s lead purchases across the organization.
          </p>
        </div>
        <a
          href="/admin/lead-spend/export"
          className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent"
        >
          Export CSV
        </a>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Total spend" value={usd(totalSpend)} />
        <Stat label="Total leads" value={totalLeads.toLocaleString()} />
        <Stat label="Avg cost / lead" value={usd(avgCpl)} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">
          By producer
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-card-hi text-left text-xs uppercase tracking-wide text-mute">
              <tr>
                <th className="px-4 py-3 font-medium">Producer</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">Leads</th>
                <th className="px-4 py-3 text-right font-medium">Cost / lead</th>
              </tr>
            </thead>
            <tbody>
              {rollups.map((r) => (
                <tr key={r.personId} className="border-t border-hairline">
                  <td className="px-4 py-3 text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-right text-ink">
                    {usd(r.spend)}
                  </td>
                  <td className="px-4 py-3 text-right text-subtle">
                    {r.leads.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-subtle">
                    {usd(r.leads > 0 ? r.spend / r.leads : 0)}
                  </td>
                </tr>
              ))}
              {rollups.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-mute" colSpan={4}>
                    No lead purchases logged yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
