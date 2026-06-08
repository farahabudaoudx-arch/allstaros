import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { LeadSpendTracker } from "@/components/producer/lead-spend/LeadSpendTracker";
import type { LeadPurchase } from "@/lib/lead-spend/types";

export const dynamic = "force-dynamic";

export default async function LeadSpendPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/lead-spend");

  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_purchases")
    .select("*")
    .eq("person_id", person.id)
    .order("purchase_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <LeadSpendTracker initialPurchases={(data as LeadPurchase[]) ?? []} />
    </main>
  );
}
