import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { ClientsList } from "@/components/producer/clients/ClientsList";
import type { Client, DepositStatus } from "@/lib/clients/types";

export const dynamic = "force-dynamic";

type DepositRow = { client_id: string; status: DepositStatus; actual_amount: number | null };

export type DepositTotals = {
  successfulCount: number;
  successfulSum: number;
  pendingCount: number;
  failedCount: number;
};

function emptyTotals(): DepositTotals {
  return { successfulCount: 0, successfulSum: 0, pendingCount: 0, failedCount: 0 };
}

export default async function ClientsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/clients");

  const supabase = await createClient();
  const [clientsRes, depositsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("person_id", person.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("client_deposits")
      .select("client_id, status, actual_amount")
      .eq("person_id", person.id),
  ]);

  // Build client_id → effective status. Default is "pending" — every saved
  // client is implicitly pending until the producer marks it successful or
  // failed, so newly written clients show up in the pending bucket without
  // needing a row in client_deposits.
  const byClient = new Map<string, DepositRow>();
  for (const row of (depositsRes.data ?? []) as DepositRow[]) {
    byClient.set(row.client_id, row);
  }

  const totals = emptyTotals();
  const clientStatuses: Record<string, DepositStatus> = {};
  for (const c of (clientsRes.data ?? []) as Client[]) {
    const row = byClient.get(c.id);
    const status: DepositStatus = row?.status ?? "pending";
    clientStatuses[c.id] = status;
    if (status === "successful") {
      totals.successfulCount += 1;
      totals.successfulSum += Number(row?.actual_amount) || 0;
    } else if (status === "failed") {
      totals.failedCount += 1;
    } else {
      totals.pendingCount += 1;
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <ClientsList
        initialClients={(clientsRes.data as Client[]) ?? []}
        depositTotals={totals}
        clientStatuses={clientStatuses}
      />
    </main>
  );
}
