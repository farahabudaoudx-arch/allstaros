"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { DEPOSIT_STATUS_LABEL, type Client, type DepositStatus } from "@/lib/clients/types";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
}

function relativeDays(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const d = Math.round(ms / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

export type DepositTotals = {
  successfulCount: number;
  successfulSum: number;
  pendingCount: number;
  failedCount: number;
};

export function ClientsList({
  initialClients,
  depositTotals,
  clientStatuses,
}: {
  initialClients: Client[];
  depositTotals: DepositTotals;
  clientStatuses: Record<string, DepositStatus>;
}) {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [query, setQuery] = useState("");
  // Data is server-fetched and arrives in the initial HTML — no loading state.
  const loading = false;

  async function handleDelete(c: Client) {
    if (!confirm(`Delete "${c.client_name || "Unnamed"}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("clients").delete().eq("id", c.id);
      if (error) throw error;
      setClients((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      alert("Could not delete: " + ((e as Error).message || "unknown error"));
    }
  }

  const filtered = clients.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (c.client_name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.policy_number || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q)
    );
  });

  const sales = clients.filter((c) => c.sale_status === "sale");
  const totalAP = sales.reduce((s, c) => s + (Number(c.annual_premium) || 0), 0);
  // Total IP = total income paid = sum of actual_amount on successful deposits.
  const totalIP = depositTotals.successfulSum;

  return (
    <div className="ll-analytics space-y-6 pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="display-mega text-white mr-2">Clients</h1>
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, policy…"
            className="input"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <span className="text-sm tnum" style={{ color: "var(--ink-2)" }}>
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "client" : "clients"}
        </span>
        <Link href="/producer/clients/new" className="btn btn-primary">
          <PlusIcon /> New Client
        </Link>
      </div>

      {/* Stat strip — no outer container. Closed sales is the only lime
          bubble; AP/IP and the pipeline use gray "card" surfaces. All
          three columns stretch to the same bottom line. */}
      <div className="grid grid-cols-12 gap-2.5" style={{ maxWidth: 760, alignItems: "stretch" }}>
        <div className="col-span-3 flex">
          <ClosedSalesBubble count={sales.length} />
        </div>
        <div className="col-span-4 flex flex-col gap-2.5">
          <StackedBubble label="Total AP" value={fmtMoney(totalAP)} />
          <StackedBubble label="Total IP" value={fmtMoney(totalIP)} />
        </div>
        <div className="col-span-5 flex flex-col gap-2.5">
          <RowBubble
            label="Successful"
            value={depositTotals.successfulCount}
            href="/producer/clients/deposits/successful"
            tone="lime"
          />
          <RowBubble
            label="Pending"
            value={depositTotals.pendingCount}
            href="/producer/clients/deposits/pending"
          />
          <RowBubble
            label="Failed"
            value={depositTotals.failedCount}
            href="/producer/clients/deposits/failed"
            tone="danger"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center py-14 text-sm" style={{ color: "var(--ink-3)" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 px-6" style={{ color: "var(--ink-3)" }}>
            {clients.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <span className="text-sm">No clients yet.</span>
                <Link href="/producer/clients/new" className="btn btn-primary">
                  <PlusIcon /> Add your first client
                </Link>
              </div>
            ) : (
              "No clients match your search."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="t-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Carrier</th>
                  <th>Policy #</th>
                  <th>State</th>
                  <th>Annual Premium</th>
                  <th>Deposit status</th>
                  <th>Updated</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const idx = c.chosen_quote_index ?? 0;
                  const quote = c.quotes?.[idx];
                  return (
                    <tr
                      key={c.id}
                      className="lead-row"
                      onClick={() => router.push(`/producer/clients/${c.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/producer/clients/${c.id}`);
                        }
                      }}
                      aria-label={`Open ${c.client_name || "client"}`}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-sm">{initials(c.client_name)}</div>
                          <div>
                            <div className="text-white whitespace-nowrap">
                              {c.client_name || <em style={{ color: "var(--ink-3)", fontStyle: "italic" }}>Unnamed</em>}
                            </div>
                            <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                              {c.email || c.phone || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--ink-2)" }} className="whitespace-nowrap">
                        {quote?.carrier || "—"}
                      </td>
                      <td className="tnum" style={{ color: "var(--ink-2)" }}>
                        {c.policy_number || "—"}
                      </td>
                      <td className="tnum" style={{ color: "var(--ink-2)" }}>{c.state || "—"}</td>
                      <td className="tnum text-white whitespace-nowrap">{fmtMoney(c.annual_premium)}</td>
                      <td>
                        <DepositStatusPill status={clientStatuses[c.id] ?? "pending"} />
                      </td>
                      <td className="text-xs tnum" style={{ color: "var(--ink-3)" }}>
                        {relativeDays(c.updated_at)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="btn-icon"
                          aria-label="Delete client"
                          title="Delete client"
                          style={{ color: "var(--danger)" }}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Gray tile chrome for the AP/IP and pipeline bubbles. Single shared
// style so they look like one set; matches the existing card surface.
const GRAY_BUBBLE: React.CSSProperties = {
  background: "var(--card-1)",
  border: "1px solid var(--line-1)",
  borderRadius: 12,
  padding: "8px 14px",
};

const LIME_BUBBLE: React.CSSProperties = {
  background: "linear-gradient(180deg, var(--mountain), var(--lime))",
  borderRadius: 12,
  padding: "10px 14px",
  color: "var(--lime-deep)",
};

const LABEL_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.78rem",
  lineHeight: 1,
  letterSpacing: "-0.01em",
};

function ClosedSalesBubble({ count }: { count: number }) {
  return (
    <div
      style={{
        ...LIME_BUBBLE,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <span style={{ ...LABEL_STYLE, opacity: 0.85 }}>Closed sales</span>
      <div
        className="tnum"
        style={{
          fontWeight: 600,
          fontSize: "3rem",
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {count}
      </div>
    </div>
  );
}

function StackedBubble({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ ...GRAY_BUBBLE, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <span style={{ ...LABEL_STYLE, color: "var(--ink-2)" }}>{label}</span>
      <div
        className="tnum"
        style={{
          color: "var(--ink-0)",
          fontWeight: 500,
          fontSize: "1.2rem",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RowBubble({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: "lime" | "danger";
}) {
  const numberColor =
    tone === "lime" ? "var(--lime)" :
    tone === "danger" ? "#fca5a5" :
    "var(--ink-0)";
  // The bubble itself is a flex row with space-between so the label sits
  // on the left and the number sits flush on the right of the tile.
  const bubbleStyle: React.CSSProperties = {
    ...GRAY_BUBBLE,
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };
  const body = (
    <>
      <span style={{ ...LABEL_STYLE, color: "var(--ink-2)" }}>{label}</span>
      <span
        className="tnum"
        style={{
          color: numberColor,
          fontWeight: 600,
          fontSize: "1.2rem",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="transition-opacity hover:opacity-80" style={bubbleStyle}>
        {body}
      </Link>
    );
  }
  return <div style={bubbleStyle}>{body}</div>;
}

function DepositStatusPill({ status }: { status: DepositStatus }) {
  if (status === "successful") return <span className="pill pill-lime">{DEPOSIT_STATUS_LABEL.successful}</span>;
  if (status === "failed")     return <span className="pill pill-danger">{DEPOSIT_STATUS_LABEL.failed}</span>;
  return <span className="pill pill-warn">{DEPOSIT_STATUS_LABEL.pending}</span>;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ color: "var(--ink-3)" }}>
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>
  );
}
