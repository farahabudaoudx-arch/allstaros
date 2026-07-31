"use client";

import { useState } from "react";
import { deleteLeadPurchase, saveLeadPurchase } from "@/app/producer/(app)/lead-spend/_actions";
import { LEAD_TYPES, type LeadPurchase } from "@/lib/lead-spend/types";
import { localIsoDate } from "@/lib/producer/time";
import { PageHeader } from "@/components/producer/PageHeader";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "$0";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // iso is a date string (YYYY-MM-DD) — parse as local, not UTC, to avoid
  // the off-by-one day shift.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Draft = {
  vendor: string;
  amount: string;
  lead_count: string;
  lead_type: string;
  purchase_date: string;
};

function emptyDraft(): Draft {
  // Pre-fill today's date so spend is always dated — an undated purchase falls
  // outside every analytics range and would silently never show up in ROI.
  return { vendor: "", amount: "", lead_count: "", lead_type: "", purchase_date: localIsoDate() };
}

export function LeadSpendTracker({
  initialPurchases,
  backHref,
}: {
  initialPurchases: LeadPurchase[];
  backHref: string;
}) {
  const [purchases, setPurchases] = useState<LeadPurchase[]>(initialPurchases);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeadPurchase | null>(null);

  const totalSpend = purchases.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalLeads = purchases.reduce((s, p) => s + (Number(p.lead_count) || 0), 0);
  const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;

  async function handleDelete(p: LeadPurchase) {
    if (!confirm(`Delete this ${p.vendor || "lead"} purchase? This cannot be undone.`)) return;
    try {
      const result = await deleteLeadPurchase(p.id);
      if (!result.ok) throw new Error(result.error);
      setPurchases((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      alert("Could not delete: " + ((e as Error).message || "unknown error"));
    }
  }

  function handleSaved(row: LeadPurchase) {
    // Replace the edited row in place, or prepend a new one; keep the table
    // sorted by purchase_date desc (nulls last) to match the server query.
    setPurchases((prev) => {
      const exists = prev.some((x) => x.id === row.id);
      const merged = exists
        ? prev.map((x) => (x.id === row.id ? row : x))
        : [row, ...prev];
      return merged.sort((a, b) => (b.purchase_date ?? "").localeCompare(a.purchase_date ?? ""));
    });
    setOpen(false);
    setEditing(null);
  }

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(p: LeadPurchase) {
    setEditing(p);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  return (
    <div className="ll-analytics space-y-6 pt-2">
      {/* Header */}
      <PageHeader title="Lead Spend" backHref={backHref}>
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm tnum" style={{ color: "var(--ink-2)" }}>
            {purchases.length.toLocaleString()} {purchases.length === 1 ? "entry" : "entries"}
          </span>
          <button type="button" onClick={openCreate} className="btn btn-primary">
            <PlusIcon /> Log lead spend
          </button>
        </div>
      </PageHeader>

      {/* Stat strip — total spend is the headline lime bubble; total leads and
          cost/lead sit alongside as gray tiles. Mirrors the Clients page. */}
      <div className="grid grid-cols-12 gap-2.5" style={{ maxWidth: 620, alignItems: "stretch" }}>
        <div className="col-span-5 flex">
          <TotalSpendBubble value={fmtMoney(totalSpend)} />
        </div>
        <div className="col-span-7 flex flex-col gap-2.5">
          <StackedBubble label="Leads bought" value={totalLeads.toLocaleString()} />
          <StackedBubble label="Avg cost / lead" value={fmtMoney(costPerLead)} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {purchases.length === 0 ? (
          <div className="text-center py-14 px-6" style={{ color: "var(--ink-3)" }}>
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm">No lead spend logged yet.</span>
              <button type="button" onClick={openCreate} className="btn btn-primary">
                <PlusIcon /> Log your first purchase
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="t-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Lead type</th>
                  <th>Leads</th>
                  <th>Amount</th>
                  <th>Cost / lead</th>
                  <th>Purchased</th>
                  <th style={{ width: 96 }}></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => {
                  const cpl = p.lead_count > 0 ? Number(p.amount) / p.lead_count : 0;
                  return (
                    <tr key={p.id}>
                      <td className="text-white whitespace-nowrap">{p.vendor || "—"}</td>
                      <td style={{ color: "var(--ink-2)" }} className="whitespace-nowrap">
                        {p.lead_type || "—"}
                      </td>
                      <td className="tnum" style={{ color: "var(--ink-2)" }}>
                        {p.lead_count.toLocaleString()}
                      </td>
                      <td className="tnum text-white whitespace-nowrap">{fmtMoney(p.amount)}</td>
                      <td className="tnum" style={{ color: "var(--ink-2)" }}>
                        {p.lead_count > 0 ? fmtMoney(cpl) : "—"}
                      </td>
                      <td className="text-xs tnum" style={{ color: "var(--ink-3)" }}>
                        {fmtDate(p.purchase_date)}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="btn-icon"
                            aria-label="Edit entry"
                            title="Edit entry"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="btn-icon"
                            aria-label="Delete entry"
                            title="Delete entry"
                            style={{ color: "var(--danger)" }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <LogSpendModal initial={editing} onClose={closeModal} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}

function LogSpendModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: LeadPurchase | null;
  onClose: () => void;
  onSaved: (row: LeadPurchase) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? {
          vendor: initial.vendor ?? "",
          amount: initial.amount != null ? String(initial.amount) : "",
          lead_count: initial.lead_count != null ? String(initial.lead_count) : "",
          lead_type: initial.lead_type ?? "",
          purchase_date: initial.purchase_date ?? localIsoDate(),
        }
      : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    if (!draft.vendor.trim()) {
      setError("Where did you buy the leads from?");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        vendor: draft.vendor.trim(),
        amount: Number(draft.amount) || 0,
        lead_count: Math.round(Number(draft.lead_count)) || 0,
        lead_type: draft.lead_type.trim() || null,
        purchase_date: draft.purchase_date || localIsoDate(),
      };
      // The write goes through a server action so the browser never talks to
      // Supabase directly (some users' networks block that and get "Failed to
      // fetch"). person_id is still filled by auth_person_id() under RLS.
      const result = await saveLeadPurchase(payload, initial?.id);
      if (!result.ok) throw new Error(result.error);
      onSaved(result.row);
    } catch (e) {
      setError((e as Error).message || "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log lead spend"
    >
      <div
        className="card w-full max-w-md"
        style={{ padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="display text-white">{initial ? "Edit lead spend" : "Log lead spend"}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Where did you buy the leads from?">
            <input
              autoFocus
              value={draft.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              placeholder="e.g. Lead vendor name"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="How much did you spend?">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="$0"
                className="input tnum"
              />
            </Field>
            <Field label="How many leads?">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.lead_count}
                onChange={(e) => set("lead_count", e.target.value)}
                placeholder="0"
                className="input tnum"
              />
            </Field>
          </div>

          <Field label="Lead type">
            <input
              list="lead-type-options"
              value={draft.lead_type}
              onChange={(e) => set("lead_type", e.target.value)}
              placeholder="e.g. Final Expense"
              className="input"
            />
            <datalist id="lead-type-options">
              {LEAD_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>

          <Field label="Date purchased">
            <input
              type="date"
              value={draft.purchase_date}
              onChange={(e) => set("purchase_date", e.target.value)}
              className="input"
            />
            {draft.purchase_date && draft.purchase_date > localIsoDate() ? (
              <p className="mt-1.5 text-xs" style={{ color: "var(--warn)" }}>
                ⚠ This date is in the future — this spend won&apos;t count toward
                Cost Analysis or ROI until {fmtDate(draft.purchase_date)}.
              </p>
            ) : null}
          </Field>

          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="btn" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : initial ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/* --- Stat bubbles (mirrors the Clients stat strip) --- */

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

function TotalSpendBubble({ value }: { value: string }) {
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
      <span style={{ ...LABEL_STYLE, opacity: 0.85 }}>Total lead spend</span>
      <div
        className="tnum"
        style={{ fontWeight: 600, fontSize: "2.6rem", lineHeight: 1, letterSpacing: "-0.03em" }}
      >
        {value}
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

/* --- Icons --- */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
