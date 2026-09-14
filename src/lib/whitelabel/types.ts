export const SERVICE_KINDS = ["vercel", "supabase", "email", "video", "ai"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_STATUSES = [
  "missing",
  "provided",
  "needs_owner_action",
  "verified",
  "failed",
  "not_required",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MAINTENANCE_STATUSES = ["undecided", "selected", "declined"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const ADDITION_TYPES = [
  "custom_feature",
  "provider_replacement",
  "data_import",
  "bulk_upload",
  "custom_ai",
  "public_website",
  "sms",
  "other",
] as const;
export type AdditionType = (typeof ADDITION_TYPES)[number];

export const ADDITION_STATUSES = ["planned", "in_progress", "blocked", "ready"] as const;
export type AdditionStatus = (typeof ADDITION_STATUSES)[number];

export type WhitelabelBuild = {
  id: string;
  agency_name: string;
  product_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  initial_admin_name: string;
  initial_admin_email: string;
  domain: string;
  timezone: string;
  payment_status: PaymentStatus;
  standard_scope_confirmed: boolean;
  maintenance_status: MaintenanceStatus;
  notes: string | null;
  brand_primary_color: string;
  brand_accent_color: string;
  logo_path: string | null;
  favicon_path: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelServiceConnection = {
  id: string;
  build_id: string;
  service_kind: ServiceKind;
  required: boolean;
  status: ServiceStatus;
  account_label: string | null;
  provider_name: string;
  account_ref: string | null;
  project_ref: string | null;
  login_email: string | null;
  billing_url: string | null;
  next_action: string | null;
  verification_method: "manual" | "provider_api";
  credential_secret_id: string | null;
  verified_by: string | null;
  status_updated_at: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelBuildAddition = {
  id: string;
  build_id: string;
  addition_type: AdditionType;
  name: string;
  delivery_requirements: string;
  timeline_notes: string | null;
  status: AdditionStatus;
  created_at: string;
  updated_at: string;
};

export type ReadinessIssue = {
  key: string;
  label: string;
  section: "intake" | "payment" | "access" | "scope";
  serviceKind?: ServiceKind;
};

export type BuildReadiness = {
  ready: boolean;
  missing: ReadinessIssue[];
};

export type WhitelabelBuildWithSetup = WhitelabelBuild & {
  services: WhitelabelServiceConnection[];
  additions: WhitelabelBuildAddition[];
  readiness: BuildReadiness;
  logoUrl?: string | null;
  faviconUrl?: string | null;
};
