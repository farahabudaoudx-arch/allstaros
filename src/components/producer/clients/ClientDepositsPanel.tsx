"use client";

import { useEffect, useMemo, useState } from "react";
import { getClientDeposit, saveClientDeposit } from "@/app/producer/clients/_actions";
import { localIsoDate } from "@/lib/producer/time";
import {
  projectedPay,
  type Client,
  type ClientDeposit,
  type DepositStatus,
} from "@/lib/clients/types";

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

export function ClientDepositsPanel({ client }: { client: Client }) {
  const [deposit, setDeposit] = useState<ClientDeposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DepositStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimated = useMemo(() => Math.round(projectedPay(client)) || 0, [client]);
  const issueDate = client.issue_date;
  const status: DepositStatus = deposit?.status ?? "pending";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Read through OUR server (server action) instead of the browser talking
      // to Supabase directly, so filtered networks can't break the panel.
      // The try/catch covers the transport itself (offline, mid-deploy); the
      // action never throws application errors.
      try {
        const result = await getClientDeposit(client.id);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
        } else {
          setDeposit(result.deposit);
        }
      } catch {
        if (cancelled) return;
        setError("Could not load the deposit. Please refresh.");
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [client.id]);

  async function setStatus(next: DepositStatus) {
    setSaving(next);
    setError(null);

    // Snapshot issue date + estimate at the moment the agent first records a
    // status, so changing client.advance_type later doesn't mutate the saved
    // deposit's expected amount.
    const issue = deposit?.issue_date ?? issueDate ?? localIsoDate();
    const estimateSnapshot = deposit?.estimated_amount ?? estimated;
    const actual = next === "successful"
      ? (deposit?.actual_amount ?? estimateSnapshot)
      : null;

    // One server action covers all three writes: update an existing deposit,
    // insert a first one (person_id stays unset; the column default fills it),
    // and the clients.issue_date backfill when a deposit first becomes
    // successful. It also revalidates /producer/clients, so the panel no
    // longer calls revalidateClientsView separately.
    try {
      const result = await saveClientDeposit(client.id, {
        depositId: deposit?.id ?? null,
        status: next,
        issue_date: issue,
        estimated_amount: estimateSnapshot,
        actual_amount: actual,
      });
      if (!result.ok) { setSaving(null); setError(result.error); return; }
      setDeposit(result.deposit);
    } catch {
      // Transport failure (offline, mid-deploy): never leave the button
      // stuck on its spinner.
      setError("Could not save. Please try again.");
    }
    setSaving(null);
  }

  const buttons: Array<{ key: DepositStatus; label: string; activeStyle: React.CSSProperties }> = [
    {
      key: "pending",
      label: "Pending",
      activeStyle: {
        borderColor: "rgba(148,163,184,0.45)",
        background: "rgba(148,163,184,0.14)",
        color: "var(--ink-1)",
      },
    },
    {
      key: "successful",
      label: "Received",
      activeStyle: {
        borderColor: "rgba(246,201,69,0.45)",
        background: "rgba(246,201,69,0.14)",
        color: "var(--lime)",
      },
    },
    {
      key: "failed",
      label: "Failed",
      activeStyle: {
        borderColor: "rgba(239,68,68,0.45)",
        background: "rgba(239,68,68,0.14)",
        color: "#fca5a5",
      },
    },
  ];

  return (
    <section className="card p-5">
      <div className="display text-lg text-white mb-4">Deposit</div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: "var(--surface-soft)", border: "1px solid var(--line-1)" }}
        >
          <div className="section-label">Upcoming issue date</div>
          <div className="display text-xl text-white tnum mt-1">{fmtDate(issueDate)}</div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: "var(--surface-soft)", border: "1px solid var(--line-1)" }}
        >
          <div className="section-label">Estimated deposit</div>
          <div className="display text-xl text-white tnum mt-1">{fmtMoney(estimated || null)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
            AP × comp% × advance%
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs mb-3" style={{ color: "var(--danger)" }}>{error}</div>
      )}

      {loading ? (
        <div className="text-sm" style={{ color: "var(--ink-3)" }}>Loading…</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {buttons.map((b) => {
            const active = status === b.key;
            const busy = saving === b.key;
            return (
              <button
                key={b.key}
                type="button"
                disabled={busy}
                onClick={() => setStatus(b.key)}
                className="btn btn-pill"
                aria-pressed={active}
                style={{
                  minWidth: 120,
                  fontWeight: 600,
                  ...(active
                    ? b.activeStyle
                    : { borderColor: "var(--line-2)", background: "var(--surface-faint)", color: "var(--ink-2)" }),
                }}
              >
                {busy ? "…" : b.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
