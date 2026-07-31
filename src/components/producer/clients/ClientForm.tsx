"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveClient, deleteClient } from "@/app/producer/(app)/clients/_actions";
import { localIsoDate } from "@/lib/producer/time";
import {
  ADVANCE_OPTIONS,
  BENEFICIARY_TYPES,
  CARRIERS,
  CARRIER_LOGOS,
  EMPTY_DRAFT,
  POLICY_TYPES,
  projectedPay,
  type Beneficiary,
  type Client,
  type ClientDraft,
  type Quote,
} from "@/lib/clients/types";

type Props = {
  clientId?: string;
  initialClient?: Client;
};

function draftFromClient(c: Client): ClientDraft {
  const { id, person_id, created_at, updated_at, ...rest } = c;
  void id; void person_id; void created_at; void updated_at;
  return {
    ...EMPTY_DRAFT,
    ...rest,
    quotes: rest.quotes?.length ? rest.quotes : [{}],
    beneficiaries: rest.beneficiaries ?? [],
  };
}

// Input sanitizers — keep certain fields numeric so nothing weird (letters, a
// stray "%") makes it onto the printed policy summary.
const digitsOnly = (s: string) => s.replace(/[^0-9]/g, "");
const phoneChars = (s: string) => s.replace(/[^0-9+()\-.\s]/g, "");
const moneyChars = (s: string) => s.replace(/[^0-9.]/g, "");

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function ClientForm({ clientId, initialClient }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<ClientDraft>(
    initialClient ? draftFromClient(initialClient) : EMPTY_DRAFT
  );

  useEffect(() => {
    if (clientId) return;
    const today = localIsoDate();
    // Stamp today's local date on the empty draft fields. Done on mount so the
    // SSR pass on the server (UTC) can't leave a stale or wrong-day default.
    setDraft((d) => ({
      ...d,
      date: d.date || today,
      submit_date: d.submit_date || today,
    }));
  }, [clientId]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const next = calcAge(draft.dob);
    setDraft((d) => (d.age === next ? d : { ...d, age: next }));
  }, [draft.dob]);

  const sourceQuoteIdx = draft.chosen_quote_index ?? 0;
  const sourceMonthly = draft.quotes[sourceQuoteIdx]?.premium ?? "";
  useEffect(() => {
    const monthly = parseFloat(String(sourceMonthly).replace(/[^0-9.]/g, ""));
    if (!isFinite(monthly)) return;
    const annual = Math.round(monthly * 12 * 100) / 100;
    setDraft((d) => (d.annual_premium === annual ? d : { ...d, annual_premium: annual }));
  }, [sourceMonthly]);

  const set = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const updateQuote = (idx: number, patch: Partial<Quote>) => {
    setDraft((d) => {
      const quotes = d.quotes.map((q, i) => (i === idx ? { ...q, ...patch } : q));
      return { ...d, quotes };
    });
  };

  const addBeneficiary = () =>
    // Most beneficiaries are primary, so new rows start there; the producer
    // flips the dropdown to Contingent for backups.
    setDraft((d) => ({ ...d, beneficiaries: [...d.beneficiaries, { bene_type: "Primary" }] }));

  const updateBeneficiary = (idx: number, patch: Partial<Beneficiary>) => {
    setDraft((d) => ({
      ...d,
      beneficiaries: d.beneficiaries.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const removeBeneficiary = (idx: number) =>
    setDraft((d) => ({
      ...d,
      beneficiaries: d.beneficiaries.filter((_, i) => i !== idx),
    }));

  const save = async () => {
    setSaving(true);
    // The write goes through our server (saveClient), not a direct
    // browser→Supabase call, so a producer on a network that can't reach
    // api.allstarlifegroup.com no longer gets "Failed to fetch". person_id is
    // still filled by the column default on insert and pinned by RLS on update,
    // so the form never sets it directly.
    let result;
    try {
      result = await saveClient(draft, clientId);
    } catch (e) {
      setSaving(false);
      alert(`Save failed: ${(e as Error).message || "could not reach the server"}`);
      return;
    }
    if (!result.ok) {
      setSaving(false);
      alert(`Save failed: ${result.error}`);
      return;
    }
    setSaving(false);
    setSavedFlash(true);
    router.push(`/producer/clients/${result.id}`);
  };

  const remove = async () => {
    if (!clientId) return;
    if (!confirm(`Delete this client? This cannot be undone.`)) return;
    try {
      const result = await deleteClient(clientId);
      if (!result.ok) {
        alert(`Delete failed: ${result.error}`);
        return;
      }
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message || "could not reach the server"}`);
      return;
    }
    router.push("/producer/clients");
  };

  return (
    <div className="ll-analytics space-y-6 pt-2">
      {/* Sticky top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/producer/clients" className="btn btn-pill text-xs">← All clients</Link>
        <h1 className="display-big text-white">
          {clientId ? (draft.client_name || "Edit client") : "New client"}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {savedFlash && (
            <span className="text-sm" style={{ color: "var(--lime)" }}>Saved ✓</span>
          )}
          {clientId && (
            <button type="button" onClick={remove} className="btn btn-pill" style={{ color: "var(--danger)" }}>
              <TrashIcon /> Delete
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* CLIENT INFO */}
      <Section title="Client information">
        <Grid cols={2}>
          <Field label="Client name" required>
            <input className="input" value={draft.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Phone">
            <input className="input tnum" inputMode="tel" value={draft.phone ?? ""} onChange={(e) => set("phone", phoneChars(e.target.value) || null)} placeholder="555-555-5555" />
          </Field>
        </Grid>
        <Field label="Email">
          <input className="input" type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value || null)} placeholder="email@example.com" />
        </Field>
        <Field label="Address">
          <input className="input" value={draft.address ?? ""} onChange={(e) => set("address", e.target.value || null)} placeholder="Street address" />
        </Field>
        <Grid cols={3}>
          <Field label="City"><input className="input" value={draft.city ?? ""} onChange={(e) => set("city", e.target.value || null)} placeholder="City" /></Field>
          <Field label="State"><input className="input" value={draft.state ?? ""} onChange={(e) => set("state", e.target.value || null)} placeholder="State" /></Field>
          <Field label="ZIP"><input className="input tnum" inputMode="numeric" maxLength={5} value={draft.postal_code ?? ""} onChange={(e) => set("postal_code", digitsOnly(e.target.value) || null)} placeholder="ZIP" /></Field>
        </Grid>
      </Section>

      {/* MEDICAL NOTES */}
      <Section title="Medical notes">
        <Grid cols={2}>
          <Field label="Date of birth" required>
            <input
              className="input"
              type="date"
              value={draft.dob ?? ""}
              onChange={(e) => {
                const dob = e.target.value || null;
                setDraft((d) => ({ ...d, dob, age: calcAge(dob) }));
              }}
            />
          </Field>
          <Field label="Age">
            <input
              className="input tnum"
              value={draft.age?.toString() ?? ""}
              readOnly
              tabIndex={-1}
              placeholder="—"
              title="Calculated from date of birth"
              style={{ opacity: 0.7, cursor: "not-allowed" }}
            />
          </Field>
        </Grid>
        <Field label="Height & weight">
          <input className="input" value={draft.height_weight ?? ""} onChange={(e) => set("height_weight", e.target.value || null)} placeholder='5&#39;10" / 180 lbs' />
        </Field>
        <Field label="Smoker">
          <YesNoSelector value={draft.smoker} onChange={(v) => set("smoker", v)} />
        </Field>
        <Field label="Notes">
          <textarea
            className="input"
            rows={5}
            value={draft.medical_notes ?? ""}
            onChange={(e) => set("medical_notes", e.target.value || null)}
            placeholder="Conditions, medications, surgeries, recent hospitalizations, anything that affects underwriting…"
            style={{ resize: "vertical", minHeight: 120, fontFamily: "inherit" }}
          />
        </Field>
      </Section>

      {/* POLICY */}
      <Section title="Policy">
        <Grid cols={2}>
          <Field label="Policy number">
            <input className="input tnum" value={draft.policy_number ?? ""} onChange={(e) => set("policy_number", e.target.value || null)} placeholder="Policy number" />
          </Field>
          <Field label="Policy written on">
            <input className="input" type="date" value={draft.submit_date ?? ""} onChange={(e) => set("submit_date", e.target.value || null)} />
          </Field>
        </Grid>
        <Grid cols={2}>
          <Field label="Payor name">
            <input className="input" value={draft.payor_name ?? ""} onChange={(e) => set("payor_name", e.target.value || null)} placeholder="Defaults to insured if blank" />
          </Field>
          <Field label="Policy issued on">
            <input className="input" type="date" value={draft.issue_date ?? ""} onChange={(e) => set("issue_date", e.target.value || null)} />
          </Field>
        </Grid>
        <Field label="Monthly payment (date/day)">
          <MonthlyPaymentPicker
            value={draft.monthly_payment_date ?? ""}
            issueDate={draft.issue_date ?? ""}
            onChange={(v) => set("monthly_payment_date", v || null)}
            onIssueDateChange={(iso) => set("issue_date", iso)}
          />
        </Field>
        <Field label="Policy notes / riders">
          <input className="input" value={draft.policy_notes ?? ""} onChange={(e) => set("policy_notes", e.target.value.trim() ? e.target.value : null)} placeholder="e.g. Accelerated Death Benefit Rider" />
        </Field>

        <div className="mt-2 mb-1">
          <span className="section-label">Selected policy</span>
        </div>
        <div className="flex flex-col gap-3">
          {draft.quotes.map((q, i) => (
            <div key={i} className="card-soft p-4 rounded-2xl">
              <CarrierPicker
                selected={q.carrier ?? ""}
                onSelect={(v) => updateQuote(i, { carrier: v })}
              />
              <div className="h-3" />
              <Grid cols={4}>
                <Select
                  value={q.policy_type ?? ""}
                  onChange={(v) => updateQuote(i, { policy_type: v })}
                  placeholder="Policy type"
                  options={POLICY_TYPES as readonly string[]}
                />
                <input className="input tnum" inputMode="decimal" value={q.coverage ?? ""} onChange={(e) => updateQuote(i, { coverage: moneyChars(e.target.value) })} placeholder="Coverage $" />
                <input className="input tnum" inputMode="decimal" value={q.premium ?? ""} onChange={(e) => updateQuote(i, { premium: moneyChars(e.target.value) })} placeholder="Premium $/mo" />
                <input className="input" value={q.notes ?? ""} onChange={(e) => updateQuote(i, { notes: e.target.value })} placeholder="Notes" />
              </Grid>
            </div>
          ))}
        </div>
      </Section>

      {/* BENEFICIARIES */}
      <Section title="Beneficiary details">
        <span className="text-xs" style={{ color: "var(--ink-3)", marginTop: -4 }}>
          Add one or more beneficiaries. These flow onto the downloadable policy summary.
        </span>
        <div className="flex flex-col gap-3">
          {draft.beneficiaries.length === 0 && (
            <div className="text-sm" style={{ color: "var(--ink-3)" }}>
              No beneficiaries added yet.
            </div>
          )}
          {draft.beneficiaries.map((b, i) => (
            <div key={i} className="card-soft p-4 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="section-label">Beneficiary {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeBeneficiary(i)}
                  className="btn btn-pill text-xs"
                  style={{ color: "var(--danger)" }}
                >
                  <TrashIcon /> Remove
                </button>
              </div>
              <Grid cols={3}>
                <Field label="Beneficiary name">
                  <input
                    className="input"
                    value={b.name ?? ""}
                    onChange={(e) => updateBeneficiary(i, { name: e.target.value })}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Relationship to insured">
                  <input
                    className="input"
                    value={b.relationship ?? ""}
                    onChange={(e) => updateBeneficiary(i, { relationship: e.target.value })}
                    placeholder="e.g. Spouse, Son, Daughter"
                  />
                </Field>
                <Field label="Beneficiary type">
                  <Select
                    value={b.bene_type ?? ""}
                    onChange={(v) => updateBeneficiary(i, { bene_type: v })}
                    placeholder="Select type"
                    options={BENEFICIARY_TYPES}
                  />
                </Field>
              </Grid>
              <div className="h-3" />
              <Grid cols={3}>
                <Field label="% of death benefit">
                  <div style={{ position: "relative" }}>
                    <input
                      className="input tnum"
                      inputMode="decimal"
                      value={b.share ?? ""}
                      onChange={(e) => updateBeneficiary(i, { share: moneyChars(e.target.value) })}
                      placeholder="e.g. 50"
                      style={{ paddingRight: 28 }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--ink-3)",
                        fontSize: 14,
                        pointerEvents: "none",
                      }}
                    >
                      %
                    </span>
                  </div>
                </Field>
                <Field label="Email (optional)">
                  <input
                    className="input"
                    type="email"
                    value={b.email ?? ""}
                    onChange={(e) => updateBeneficiary(i, { email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    className="input tnum"
                    inputMode="tel"
                    value={b.phone ?? ""}
                    onChange={(e) => updateBeneficiary(i, { phone: phoneChars(e.target.value) })}
                    placeholder="555-555-5555"
                  />
                </Field>
              </Grid>
            </div>
          ))}
          <div>
            <button type="button" onClick={addBeneficiary} className="btn btn-pill">
              + Add beneficiary
            </button>
          </div>
        </div>
      </Section>

      {/* PRIVATE NOTES — internal only, never printed on the policy summary */}
      <Section title="Private notes">
        <span className="text-xs" style={{ color: "var(--ink-3)", marginTop: -4 }}>
          Internal only. This <strong>never</strong> appears on the policy summary.
        </span>
        <Field label="Notes">
          <textarea
            className="input"
            rows={5}
            value={draft.private_notes ?? ""}
            onChange={(e) => set("private_notes", e.target.value || null)}
            placeholder="Private notes for your eyes only — not shown to the client…"
            style={{ resize: "vertical", minHeight: 120, fontFamily: "inherit" }}
          />
        </Field>
      </Section>

      {/* COMMISSION */}
      <Section title="Commission estimate">
        <div className="card-soft p-5 rounded-2xl">
          <div className="grid gap-3 md:items-end md:[grid-template-columns:1fr_auto_1fr_auto_1.4fr]">
            <Field label="Annual premium">
              <CurrencyInput value={draft.annual_premium} onChange={(v) => set("annual_premium", v)} />
            </Field>
            <div className="hidden md:flex md:items-center md:pb-3"><TimesGlyph /></div>
            <Field label="Product comp %">
              <PercentInput value={draft.product_comp_pct} onChange={(v) => set("product_comp_pct", v)} />
            </Field>
            <div className="hidden md:flex md:items-center md:pb-3"><TimesGlyph /></div>
            <Field label="Advance">
              <select
                className="input"
                value={draft.advance_type}
                onChange={(e) => set("advance_type", e.target.value)}
              >
                {ADVANCE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-col gap-2 mt-4 sm:flex-row sm:justify-between sm:items-center">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              Formula: AP × Comp Rate × Advance Rate
            </span>
            <span className="display text-2xl tnum" style={{ color: "var(--lime)" }}>
              = {fmtCurrency(projectedPay(draft))}
            </span>
          </div>
        </div>
      </Section>

      {/* FOOTER actions. Saved client always defaults to sale_status = "sale"
          and is_primary_client = true — handled in EMPTY_DRAFT / saved record. */}
      <div className="flex items-center gap-3 flex-wrap pb-6">
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => { if (confirm("Clear all fields?")) setDraft(EMPTY_DRAFT); }}
            className="btn btn-pill"
          >
            <TrashIcon /> Clear
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- commission helpers --------------------------------------
function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function CurrencyInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", fontSize: 14, pointerEvents: "none" }}>$</span>
      <input
        className="input tnum"
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={{ paddingLeft: 26 }}
      />
    </div>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        className="input tnum"
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        style={{ paddingRight: 28 }}
      />
      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", fontSize: 14, pointerEvents: "none" }}>%</span>
    </div>
  );
}

function TimesGlyph() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 42, color: "var(--ink-3)", fontSize: 18 }}>
      ×
    </div>
  );
}


// ---------- presentational helpers ----------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="display text-lg text-white mb-4">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  // Cramped multi-column rows (e.g. the 4-up Selected Policy row) collapse on
  // phones so inputs aren't cut off; plain 2-up rows stay 2-up.
  const cls =
    cols >= 4
      ? "grid-cols-2 md:grid-cols-4"
      : cols === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-2";
  return <div className={`grid gap-3 ${cls}`}>{children}</div>;
}

function Field({ label, required, children, suffix }: { label: string; required?: boolean; children: React.ReactNode; suffix?: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label flex items-center" style={{ marginBottom: 0 }}>
        <span>{label}{required && <span style={{ color: "var(--warn)", marginLeft: 2 }}>*</span>}</span>
        {suffix && <span className="ml-auto">{suffix}</span>}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: readonly string[] }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function YesNoSelector({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {([
        { label: "Yes", v: true },
        { label: "No",  v: false },
      ] as const).map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            className="btn btn-pill"
            aria-pressed={on}
            style={{
              minWidth: 96,
              borderColor: on ? "var(--lime)" : "var(--line-2)",
              background: on ? "rgba(246,201,69,0.10)" : "var(--surface-faint)",
              color: on ? "var(--lime)" : "var(--ink-2)",
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Initials shown only as a fallback when the logo file is missing or fails to
// load. For 1-word names use first two letters; for multi-word names use the
// first letter of the first two words.
function carrierInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function CarrierPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (v: string) => void;
}) {
  const finalNames = CARRIERS as readonly string[];
  // Track which logos failed to load so we can swap in initials. We never paint
  // initials *behind* a logo — transparent logos (e.g. Mutual of Omaha) would
  // show the letters bleeding through. Initials appear only when there's no
  // usable image.
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))" }}>
      {finalNames.map((name) => {
        const logo = CARRIER_LOGOS[name];
        const showInitials = !logo || failed[name];
        const isSelected = selected === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(isSelected ? "" : name)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl p-2 transition-colors"
            style={{
              border: `1.5px solid ${isSelected ? "var(--lime)" : "var(--line-2)"}`,
              background: isSelected ? "rgba(246,201,69,0.06)" : "var(--surface-faint)",
              minHeight: 96,
              cursor: "pointer",
            }}
          >
            <div style={{
              width: "100%",
              height: 48,
              background: "#fff",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              overflow: "hidden",
              position: "relative",
            }}>
              {showInitials ? (
                <span
                  aria-hidden
                  style={{
                    color: "#1f2937",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: 0.5,
                  }}
                >
                  {carrierInitials(name)}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={name}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  onError={() => setFailed((f) => ({ ...f, [name]: true }))}
                />
              )}
            </div>
            <span className="text-xs text-center" style={{ color: isSelected ? "var(--lime)" : "var(--ink-2)", fontWeight: 500 }}>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- monthly payment picker ---------------------------------
const ORDINALS = ["First", "Second", "Third", "Fourth"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function nthWeekdayOf(year: number, monthIdx: number, weekdayIdx: number, n: number): Date {
  const first = new Date(year, monthIdx, 1);
  const offset = (weekdayIdx - first.getDay() + 7) % 7;
  return new Date(year, monthIdx, 1 + offset + (n - 1) * 7);
}

function nextNthWeekday(weekdayIdx: number, n: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = nthWeekdayOf(today.getFullYear(), today.getMonth(), weekdayIdx, n);
  // Strictly future: if this month's occurrence is today or past, roll to next.
  if (d <= today) d = nthWeekdayOf(today.getFullYear(), today.getMonth() + 1, weekdayIdx, n);
  return d;
}

function formatMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function dayWithSuffix(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function parseWeekdayValue(v: string): { ordinal: number; weekday: number } | null {
  for (let i = 0; i < ORDINALS.length; i++) {
    for (let j = 0; j < WEEKDAYS.length; j++) {
      if (v === `${ORDINALS[i]} ${WEEKDAYS[j]} of every month`) return { ordinal: i + 1, weekday: j };
    }
  }
  return null;
}

function dayFromIssueDate(issueDate: string): number | null {
  const m = issueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Number(m[3]);
}

function MonthlyPaymentPicker({
  value,
  issueDate,
  onChange,
  onIssueDateChange,
}: {
  value: string;
  issueDate: string;
  onChange: (v: string) => void;
  onIssueDateChange: (iso: string) => void;
}) {
  const weekday = parseWeekdayValue(value);
  const mode: "auto" | "weekday" = weekday ? "weekday" : "auto";

  // Picking an "Nth weekday" recurrence also stamps "Policy issued on" with the
  // next occurrence of that day — e.g. 3rd Friday → 6/19/2026. Still editable.
  const applyRecurrence = (ordinal: number, weekdayIdx: number) => {
    onChange(`${ORDINALS[ordinal - 1]} ${WEEKDAYS[weekdayIdx]} of every month`);
    onIssueDateChange(localIsoDate(nextNthWeekday(weekdayIdx, ordinal)));
  };

  const setMode = (next: "auto" | "weekday") => {
    if (next === "auto") onChange("");
    else applyRecurrence(1, 3); // First Wednesday
  };

  const issueDay = dayFromIssueDate(issueDate);
  const autoDisplay = issueDay ? `${dayWithSuffix(issueDay)} of every month` : "—";
  const preview = weekday ? formatMDY(nextNthWeekday(weekday.weekday, weekday.ordinal)) : null;

  return (
    <div className="flex flex-col gap-2">
      <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "auto" | "weekday")}>
        <option value="auto">Same day as Policy Issued On</option>
        <option value="weekday">Nth day of every month</option>
      </select>

      {mode === "auto" && (
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          Payment day: <span style={{ color: "var(--lime)", fontWeight: 500 }}>{autoDisplay}</span>
          {!issueDay && " — set Policy Issued On above"}
        </span>
      )}

      {mode === "weekday" && weekday && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={ORDINALS[weekday.ordinal - 1]}
              onChange={(e) => applyRecurrence(ORDINALS.indexOf(e.target.value as typeof ORDINALS[number]) + 1, weekday.weekday)}
            >
              {ORDINALS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select
              className="input"
              value={WEEKDAYS[weekday.weekday]}
              onChange={(e) => applyRecurrence(weekday.ordinal, WEEKDAYS.indexOf(e.target.value as typeof WEEKDAYS[number]))}
            >
              {WEEKDAYS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {preview && (
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              Next occurrence: <span style={{ color: "var(--lime)", fontWeight: 500 }}>{preview}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
    </svg>
  );
}
