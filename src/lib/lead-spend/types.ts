export type LeadPurchase = {
  id: string;
  person_id: string;
  vendor: string;
  amount: number;
  lead_count: number;
  lead_type: string | null;
  purchase_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Common final-expense / life lead types — offered as suggestions in the log
// form, but the field stays free-text so producers can enter anything.
export const LEAD_TYPES = [
  "Final Expense",
  "Mortgage Protection",
  "Term",
  "IUL",
  "Annuity",
  "Veteran",
  "Aged",
  "Live Transfer",
] as const;
