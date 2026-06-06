export type Quote = {
  carrier?: string;
  policy_type?: string;
  coverage?: string;
  premium?: string;
  notes?: string;
};

export type Beneficiary = {
  name?: string;
  relationship?: string;
  email?: string;
  phone?: string;
};

export type DepositStatus = "pending" | "successful" | "failed";

export type ClientDeposit = {
  id: string;
  person_id: string;
  client_id: string;
  issue_date: string;
  estimated_amount: number | null;
  actual_amount: number | null;
  status: DepositStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: "Pending",
  successful: "Successful",
  failed: "Failed",
};

export type PaymentMethod = "bank_draft" | "credit_card";

export type SaleStatus = "in_progress" | "missed" | "sale";

export type AdvanceOption = {
  key: string;
  label: string;
  rate: number; // 0..1
};

export const ADVANCE_OPTIONS: AdvanceOption[] = [
  { key: "75_9mo",  label: "75% (9-mo advance)",  rate: 0.75 },
  { key: "100_12mo", label: "100% (12-mo advance)", rate: 1.00 },
  { key: "50_6mo",  label: "50% (6-mo advance)",  rate: 0.50 },
  { key: "25_3mo",  label: "25% (3-mo advance)",  rate: 0.25 },
  { key: "as_earned", label: "As-earned (no advance)", rate: 0 },
];

// Shared projected-pay formula. Used by the client form (footer estimate)
// and the Deposits panel on the client detail page so both stay in sync.
// Formula: AP × comp% × advance-rate.
export function projectedPay(input: {
  annual_premium: number | null;
  product_comp_pct: number | null | undefined;
  advance_type: string | null | undefined;
}): number {
  const ap = Number(input.annual_premium);
  const comp = Number(input.product_comp_pct);
  const adv = ADVANCE_OPTIONS.find((o) => o.key === input.advance_type)?.rate ?? 0;
  if (!Number.isFinite(ap) || !Number.isFinite(comp)) return 0;
  return ap * (comp / 100) * adv;
}

export type Client = {
  id: string;
  person_id: string;

  client_name: string;
  date: string | null;
  ssn: string | null;
  dob: string | null;
  age: number | null;
  phone: string | null;
  smoker: boolean;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  height_weight: string | null;
  medical_notes: string | null;

  lead_vendor: string | null;
  lead_type: string | null;
  lead_age: string | null;
  field_or_tele: string | null;
  appointment_type: string | null;

  policy_number: string | null;
  submit_date: string | null;
  first_draft_date: string | null;
  payor_name: string | null;
  issue_date: string | null;
  monthly_payment_date: string | null;
  policy_notes: string | null;

  payment_method: PaymentMethod;
  bank_name: string | null;
  routing_number: string | null;
  account_number: string | null;
  cc_name: string | null;
  cc_number: string | null;
  cc_expiry: string | null;
  cc_cvv: string | null;

  quotes: Quote[];
  chosen_quote_index: number | null;

  beneficiaries: Beneficiary[];

  annual_premium: number | null;
  product_comp_pct: number;
  advance_type: string;
  sale_status: SaleStatus;
  is_primary_client: boolean;

  created_at: string;
  updated_at: string;
};

export type ClientDraft = Omit<Client, "id" | "person_id" | "created_at" | "updated_at">;

export const EMPTY_DRAFT: ClientDraft = {
  client_name: "",
  // date / submit_date are stamped at form-open time in ClientForm. Evaluating
  // `new Date()` here would run at module load on the server (UTC) and then
  // stick for the lifetime of the process — wrong tz and stale.
  date: "",
  ssn: null,
  dob: null,
  age: null,
  phone: null,
  smoker: false,
  email: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  height_weight: null,
  medical_notes: null,
  lead_vendor: null,
  lead_type: null,
  lead_age: null,
  field_or_tele: null,
  appointment_type: null,
  policy_number: null,
  submit_date: "", // see note above on date
  first_draft_date: null,
  payor_name: null,
  issue_date: null,
  monthly_payment_date: null,
  policy_notes: null,
  payment_method: "bank_draft",
  bank_name: null,
  routing_number: null,
  account_number: null,
  cc_name: null,
  cc_number: null,
  cc_expiry: null,
  cc_cvv: null,
  quotes: [{}],
  chosen_quote_index: 0,
  beneficiaries: [],
  annual_premium: null,
  product_comp_pct: 140,
  advance_type: "75_9mo",
  sale_status: "sale",
  is_primary_client: true,
};

// Company-level carrier catalog shown in the policy picker.
export const CARRIERS = [
  "American Amicable",
  "Americo",
  "Corebridge",
  "Ethos",
  "InstaBrain",
  "Mutual of Omaha",
  "Transamerica",
] as const;

export const CARRIER_LOGOS: Record<string, string> = {
  "American Amicable": "/carriers/american-amicable.png",
  "Americo": "/carriers/americo.png",
  "Corebridge": "/carriers/corebridge.png",
  "Ethos": "/carriers/ethos.png",
  "InstaBrain": "/carriers/instabrain.png",
  "Mutual of Omaha": "/carriers/mutual-of-omaha.png",
  "Transamerica": "/carriers/transamerica.jpg",
};

// Carrier policyholder support lines, shown on the generated policy PDF.
export const CARRIER_SUPPORT_PHONES: Record<string, string> = {
  "American Amicable": "800-736-7311",
  "Americo": "800-231-0801",
  "Corebridge": "800-448-2542",
  "Ethos": "877-913-8467",
  "InstaBrain": "800-806-9714",
  "Mutual of Omaha": "800-775-6000",
  "Transamerica": "800-851-9777",
};

export const POLICY_TYPES = [
  "Whole Life", "Term", "IUL", "Final Expense", "Annuity", "Other",
] as const;
