import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import type { LeadPurchase } from "@/lib/lead-spend/types";

function csvCell(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /admin/lead-spend/export — full org lead-purchase ledger as CSV.
export async function GET() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: purchaseData }, { data: personData }] = await Promise.all([
    supabase
      .from("lead_purchases")
      .select(
        "id, person_id, vendor, amount, lead_count, lead_type, purchase_date, notes",
      )
      .order("purchase_date", { ascending: false }),
    supabase.from("person").select("id, full_name"),
  ]);

  const purchases = (purchaseData ?? []) as LeadPurchase[];
  const nameById = new Map(
    (personData ?? []).map((p) => [p.id, p.full_name as string]),
  );

  const header = [
    "Producer",
    "Vendor",
    "Lead Type",
    "Lead Count",
    "Amount",
    "Cost Per Lead",
    "Purchase Date",
    "Notes",
  ];
  const rows = purchases.map((p) => {
    const amount = Number(p.amount || 0);
    const leads = Number(p.lead_count || 0);
    return [
      nameById.get(p.person_id) ?? "Unknown",
      p.vendor,
      p.lead_type ?? "",
      leads,
      amount.toFixed(2),
      leads > 0 ? (amount / leads).toFixed(2) : "0.00",
      p.purchase_date ?? "",
      p.notes ?? "",
    ];
  });

  const csv = [header, ...rows]
    .map((cols) => cols.map(csvCell).join(","))
    .join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="lead-spend.csv"',
    },
  });
}
