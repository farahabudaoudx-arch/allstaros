import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  ADVANCE_OPTIONS,
  DEPOSIT_STATUS_LABEL,
  type Client,
  type ClientDeposit,
  type DepositStatus,
} from "@/lib/clients/types";

export const dynamic = "force-dynamic";

const ALLOWED: ReadonlySet<DepositStatus> = new Set(["successful", "pending", "failed"]);

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(Number(n))) return "—";
  return `$${Math.round(Number(n)).toLocaleString()}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return iso;
}

function projectedPay(c: Client): number {
  const ap = Number(c.annual_premium);
  const comp = Number(c.product_comp_pct);
  const adv = ADVANCE_OPTIONS.find((o) => o.key === c.advance_type)?.rate ?? 0;
  if (!Number.isFinite(ap) || !Number.isFinite(comp)) return 0;
  return ap * (comp / 100) * adv;
}

type Row = {
  client: Client;
  deposit: ClientDeposit | null;
  effectiveStatus: DepositStatus;
  issueDate: string | null;
  estimated: number;
  actual: number | null;
};

export default async function DepositsByStatusPage({
  params,
}: {
  params: Promise<{ status: string }>;
}) {
  const { status: statusParam } = await params;
  if (!ALLOWED.has(statusParam as DepositStatus)) notFound();
  const status = statusParam as DepositStatus;

  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=/producer/clients/deposits/${status}`);

  const supabase = await createClient();
  const [clientsRes, depositsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("person_id", person.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("client_deposits")
      .select("*")
      .eq("person_id", person.id),
  ]);

  if (clientsRes.error || depositsRes.error) {
    return (
      <main className="ll-analytics mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
        <div className="pt-2 space-y-4">
          <Link href="/producer/clients" className="btn btn-pill text-xs">← All clients</Link>
          <div className="card p-6 text-sm" style={{ color: "var(--danger)" }}>
            Failed to load deposits: {clientsRes.error?.message ?? depositsRes.error?.message}
          </div>
        </div>
      </main>
    );
  }

  const byClient = new Map<string, ClientDeposit>();
  for (const d of (depositsRes.data ?? []) as ClientDeposit[]) {
    byClient.set(d.client_id, d);
  }

  const rows: Row[] = ((clientsRes.data ?? []) as Client[])
    .map((client) => {
      const deposit = byClient.get(client.id) ?? null;
      const effectiveStatus: DepositStatus = deposit?.status ?? "pending";
      const issueDate = deposit?.issue_date ?? client.issue_date;
      const estimated = deposit?.estimated_amount != null
        ? Number(deposit.estimated_amount)
        : Math.round(projectedPay(client));
      const actual = deposit?.actual_amount != null ? Number(deposit.actual_amount) : null;
      return { client, deposit, effectiveStatus, issueDate, estimated, actual };
    })
    .filter((r) => r.effectiveStatus === status)
    .sort((a, b) => {
      const aDate = a.issueDate ?? "";
      const bDate = b.issueDate ?? "";
      return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
    });

  const totalSuccessful = rows.reduce((s, r) => s + (r.actual ?? 0), 0);

  return (
    <main className="ll-analytics mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="space-y-6 pt-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/producer/clients" className="btn btn-pill text-xs">← All clients</Link>
          <h1 className="display-mega text-white mr-2">
            {DEPOSIT_STATUS_LABEL[status]} deposits
          </h1>
          <span className="text-sm tnum" style={{ color: "var(--ink-2)" }}>
            {rows.length.toLocaleString()} {rows.length === 1 ? "client" : "clients"}
          </span>
          {status === "successful" && (
            <span className="text-sm tnum" style={{ color: "var(--lime)" }}>
              {fmtMoney(totalSuccessful)} paid
            </span>
          )}
        </div>

        <div className="card overflow-hidden">
          {rows.length === 0 ? (
            <div className="text-center py-14 text-sm" style={{ color: "var(--ink-3)" }}>
              No {DEPOSIT_STATUS_LABEL[status].toLowerCase()} deposits yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--ink-3)" }} className="text-left text-xs uppercase tracking-wide">
                  <th className="px-5 py-3">Issue date</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3 text-right">Estimated</th>
                  <th className="px-5 py-3 text-right">
                    {status === "successful" ? "Received" : "Actual"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.client.id}
                    className="border-t hover:bg-[var(--surface-soft)]"
                    style={{ borderColor: "var(--line-1)" }}
                  >
                    <td className="px-5 py-3 tnum">{fmtDate(r.issueDate)}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/producer/clients/${r.client.id}`}
                        className="hover:underline"
                        style={{ color: "var(--ink-1)" }}
                      >
                        {r.client.client_name || "Unnamed"}
                        {r.client.state ? (
                          <span className="ml-2 text-xs" style={{ color: "var(--ink-3)" }}>
                            · {r.client.state}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-5 py-3 tnum text-right" style={{ color: "var(--ink-2)" }}>
                      {fmtMoney(r.estimated || null)}
                    </td>
                    <td className="px-5 py-3 tnum text-right" style={{ color: "var(--ink-1)" }}>
                      {status === "successful" ? fmtMoney(r.actual) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
