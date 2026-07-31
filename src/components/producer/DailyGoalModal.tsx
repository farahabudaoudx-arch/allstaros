"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buttonClass } from "@/components/ui";

export type GoalValues = {
  dials: number;
  leads: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
  ap_cents: number;
};

export const EMPTY_GOAL: GoalValues = {
  dials: 0,
  leads: 0,
  contacts: 0,
  appointments: 0,
  presentations: 0,
  sales: 0,
  ap_cents: 0,
};

/** Same six activities the tracker counts, in the order they appear there,
 *  plus the AP goal that only shows on the dashboard. The hint under each
 *  label spells out what the number means so nobody has to guess. */
const FIELDS: Array<{ key: keyof GoalValues; label: string; hint: string; money?: boolean }> = [
  { key: "dials", label: "Dials", hint: "Dials you'll make today" },
  { key: "leads", label: "Leads", hint: "Leads you'll receive today" },
  { key: "contacts", label: "Contacts", hint: "People who will pick up the phone today" },
  { key: "appointments", label: "Appointments", hint: "Appointments you'll set today" },
  { key: "presentations", label: "Presentations", hint: "People you'll present numbers to today" },
  { key: "sales", label: "Policies Sold", hint: "Policies you'll write today" },
  { key: "ap_cents", label: "AP", hint: "Premium you'll submit today", money: true },
];

type FormState = Record<keyof GoalValues, string>;

function toForm(v: GoalValues): FormState {
  return {
    dials: v.dials ? String(v.dials) : "",
    leads: v.leads ? String(v.leads) : "",
    contacts: v.contacts ? String(v.contacts) : "",
    appointments: v.appointments ? String(v.appointments) : "",
    presentations: v.presentations ? String(v.presentations) : "",
    sales: v.sales ? String(v.sales) : "",
    ap_cents: v.ap_cents ? String(v.ap_cents / 100) : "",
  };
}

const int = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

/**
 * "Let's set your goals for today" popup on the Daily Tracker. Opened
 * automatically the first time someone lands on the tracker on a day with no
 * projection saved yet, and on demand from the header button after that.
 *
 * What gets saved here is the same daily_projection row the dashboard reads,
 * so the numbers entered become the targets every progress bar on the tracker
 * counts up against.
 */
export function DailyGoalModal({
  open,
  initial,
  isEdit,
  saving,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: GoalValues;
  /** Editing an existing goal rather than being asked for the first time. */
  isEdit: boolean;
  saving: boolean;
  error: string | null;
  onSave: (next: GoalValues) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));

  // Reload the fields whenever the popup opens so it always reflects what's saved.
  useEffect(() => {
    if (open) setForm(toForm(initial));
  }, [open, initial]);

  // Lock background scroll while it's up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  const set = (key: keyof GoalValues, v: string) => setForm((p) => ({ ...p, [key]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      dials: int(form.dials),
      leads: int(form.leads),
      contacts: int(form.contacts),
      appointments: int(form.appointments),
      presentations: int(form.presentations),
      sales: int(form.sales),
      ap_cents: Math.max(0, Math.round((Number(form.ap_cents) || 0) * 100)),
    });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/80"
            aria-hidden
            onClick={() => {
              if (!saving) onClose();
            }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Set today's goals"
            className="relative my-auto w-full max-w-lg rounded-2xl border border-hairline bg-card p-7 sm:p-8"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
          >
            <h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
              {isEdit ? "Update today's goals" : "Let's set your goals for today"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-subtle">
              Put a number on each one. Every counter on the tracker fills up against the
              goal you set here, so you can see where you stand all day.
            </p>

            <form onSubmit={submit}>
              {/* One row per goal — name and plain-English hint on the left,
                  the number on the right, so it reads top to bottom. */}
              <div className="mt-6 divide-y divide-hairline border-y border-hairline">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{f.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-mute">{f.hint}</span>
                    </span>
                    <span className="flex w-28 shrink-0 items-baseline rounded-lg border border-hairline bg-card-hi px-2.5 py-1.5 focus-within:border-accent">
                      {f.money ? <span className="mr-0.5 text-base text-mute">$</span> : null}
                      <input
                        type="number"
                        min={0}
                        step={f.money ? "0.01" : "1"}
                        inputMode={f.money ? "decimal" : "numeric"}
                        value={form[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        placeholder="0"
                        // Kill the native up/down spinner — it pops over the value
                        // on hover and there's nothing to step through here.
                        className="w-full bg-transparent text-right text-lg font-semibold tabular-nums text-ink outline-none [appearance:textfield] placeholder:text-mute [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </span>
                  </label>
                ))}
              </div>

              {error ? <p className="mt-4 text-sm text-neg">{error}</p> : null}

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
                <button
                  type="submit"
                  disabled={saving}
                  className={buttonClass("primary", "w-full py-3 sm:w-auto sm:px-6")}
                >
                  {saving ? "Saving…" : isEdit ? "Save goals" : "Start my day"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className={buttonClass("ghost", "w-full py-3 sm:w-auto sm:px-6")}
                >
                  {isEdit ? "Cancel" : "Skip for today"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
