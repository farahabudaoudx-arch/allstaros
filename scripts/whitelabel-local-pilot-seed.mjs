import { createClient } from "@supabase/supabase-js";

const target = (process.argv[2] ?? "a").toLowerCase();
if (!['a', 'b'].includes(target)) {
  throw new Error("Usage: node --env-file=.env.local scripts/whitelabel-local-pilot-seed.mjs <a|b>");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || process.env.WHITELABEL_LOCAL_PILOT !== "1") {
  throw new Error("Local pilot control-plane environment is required.");
}

const suffix = target.toUpperCase();
const domain = `customer-${target}.local`;
const projectRef = `local-customer-${target}`;
const adminEmail = `owner-${target}@allstar.test`;
const now = new Date().toISOString();
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: actor, error: actorError } = await client
  .from("person")
  .select("id")
  .eq("email", "admin@allstar.test")
  .single();
if (actorError || !actor) throw actorError ?? new Error("Local pilot admin actor is missing.");

const buildValues = {
  agency_name: `Pilot Agency ${suffix}`,
  product_name: `Pilot OS ${suffix}`,
  short_name: `Pilot ${suffix}`,
  primary_contact_name: `Pilot Owner ${suffix}`,
  primary_contact_email: adminEmail,
  initial_admin_name: `Pilot Owner ${suffix}`,
  initial_admin_email: adminEmail,
  domain,
  timezone: "America/Chicago",
  payment_status: "paid",
  standard_scope_confirmed: true,
  maintenance_status: "selected",
  notes: "Local pilot only. No external providers or production resources.",
  brand_primary_color: target === "a" ? "#164E63" : "#1E3A8A",
  brand_accent_color: target === "a" ? "#22D3EE" : "#60A5FA",
  support_email: `support-${target}@allstar.test`,
  reply_to_email: `support-${target}@allstar.test`,
  email_from: `Pilot ${suffix} <support-${target}@allstar.test>`,
  licensing_provider_name: "Local Licensing Pilot",
  licensing_code: `LOCAL-${suffix}`,
  licensing_login_url: `https://licensing-${target}.local/login`,
  licensing_requirements_url: `https://licensing-${target}.local/requirements`,
  licensing_application_url: `https://licensing-${target}.local/apply`,
  graduation_policy_count: 8,
  graduation_window_days: 28,
  stall_persisted_lapse_days: 3,
  stall_exam_unscheduled_days: 3,
  stall_no_checkin_days: 2,
  stall_checkin_lapsed_days: 2,
  updated_by: actor.id,
};

let { data: build, error: buildLookupError } = await client
  .from("whitelabel_build")
  .select("id")
  .eq("domain", domain)
  .maybeSingle();
if (buildLookupError) throw buildLookupError;

if (!build) {
  const inserted = await client
    .from("whitelabel_build")
    .insert({ ...buildValues, created_by: actor.id })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Could not create local pilot build.");
  build = inserted.data;
} else {
  const updated = await client.from("whitelabel_build").update(buildValues).eq("id", build.id);
  if (updated.error) throw updated.error;
}

// Valid 1x1 transparent PNG. Branding content is intentionally tiny for the
// local pilot; the real intake/storage path and MIME checks are still exercised.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const logoPath = `${build.id}/branding/logo.png`;
const faviconPath = `${build.id}/branding/favicon.png`;
for (const objectPath of [logoPath, faviconPath]) {
  const upload = await client.storage.from("whitelabel-intake").upload(objectPath, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw upload.error;
}
const assetUpdate = await client
  .from("whitelabel_build")
  .update({ logo_path: logoPath, favicon_path: faviconPath, updated_by: actor.id })
  .eq("id", build.id);
if (assetUpdate.error) throw assetUpdate.error;

const services = [
  {
    kind: "vercel",
    provider: "Vercel",
    accountRef: "local",
    projectRef,
    accountLabel: `Local Vercel ${suffix}`,
    billingUrl: "https://local.invalid/vercel",
  },
  {
    kind: "supabase",
    provider: "Supabase",
    accountRef: "local",
    projectRef,
    accountLabel: `Local Supabase ${suffix}`,
    billingUrl: "https://local.invalid/supabase",
  },
  {
    kind: "email",
    provider: "Resend",
    accountRef: `local-email-${target}`,
    projectRef: null,
    accountLabel: `Local Email ${suffix}`,
    billingUrl: "https://local.invalid/email",
  },
  {
    kind: "ai",
    provider: "Anthropic",
    accountRef: `local-ai-${target}`,
    projectRef: null,
    accountLabel: `Local AI ${suffix}`,
    billingUrl: "https://local.invalid/ai",
  },
];

for (const service of services) {
  const secret = `local-pilot-${target}-${service.kind}-credential`;
  const stored = await client.rpc("store_whitelabel_service_credential", {
    p_build_id: build.id,
    p_service_kind: service.kind,
    p_secret: secret,
  });
  if (stored.error) throw stored.error;

  const updated = await client
    .from("whitelabel_service_connection")
    .update({
      status: "verified",
      provider_name: service.provider,
      account_ref: service.accountRef,
      project_ref: service.projectRef,
      account_label: service.accountLabel,
      billing_url: service.billingUrl,
      next_action: null,
      verification_method: "provider_api",
      verified_by: actor.id,
      status_updated_at: now,
      last_checked_at: now,
    })
    .eq("build_id", build.id)
    .eq("service_kind", service.kind);
  if (updated.error) throw updated.error;
}

const { data: check, error: checkError } = await client
  .from("whitelabel_service_connection")
  .select("service_kind,status,project_ref,credential_secret_id")
  .eq("build_id", build.id)
  .order("service_kind");
if (checkError) throw checkError;

console.log(JSON.stringify({
  target,
  buildId: build.id,
  actorId: actor.id,
  domain,
  services: check?.map((row) => ({
    kind: row.service_kind,
    status: row.status,
    projectRef: row.project_ref,
    hasCredential: Boolean(row.credential_secret_id),
  })),
}));
