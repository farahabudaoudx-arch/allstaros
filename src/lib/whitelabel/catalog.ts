import type { AdditionType, ServiceKind, ServiceStatus } from "./types";

export const SERVICE_CATALOG: Record<
  ServiceKind,
  { label: string; description: string; defaultRequired: boolean }
> = {
  vercel: {
    label: "Vercel",
    description: "Application account and target project.",
    defaultRequired: true,
  },
  supabase: {
    label: "Supabase",
    description: "Database/Auth/Storage account and target project.",
    defaultRequired: true,
  },
  email: {
    label: "Email",
    description: "Transactional email account and sender setup.",
    defaultRequired: true,
  },
  video: {
    label: "Video",
    description: "Video account when the build uses hosted training/video.",
    defaultRequired: false,
  },
  ai: {
    label: "AI",
    description: "AI account used by the included standard coach.",
    defaultRequired: true,
  },
};

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  missing: "Missing",
  provided: "Reference provided",
  needs_owner_action: "Owner action needed",
  verified: "Access verified",
  failed: "Connection failed",
  not_required: "Not required",
};

export const ADDITION_TYPE_LABELS: Record<AdditionType, string> = {
  custom_feature: "Custom feature",
  provider_replacement: "Provider replacement",
  data_import: "Data import",
  bulk_upload: "Bulk upload",
  custom_ai: "Custom AI",
  public_website: "Public website",
  sms: "SMS work",
  other: "Other",
};
