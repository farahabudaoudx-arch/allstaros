// One-off: register a real email as a builder (additive: builder + producer).
//
//   node --env-file=.env.local scripts/make-builder.mjs "email@example.com" "Full Name"
//
// Magic-link auth means no password is created here — we only ensure a `person`
// row exists with builder access. On the user's first magic-link sign-in,
// linkPersonByEmail() attaches their auth user to this row by email.
//
// Idempotent and non-destructive: if a row for the email already exists, it only
// flips the role flags + status to active and never clobbers an existing
// auth_user_id link.

import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim();
const fullName = (process.argv[3] ?? "").trim();

if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/make-builder.mjs "email" "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing, error: selErr } = await admin
  .from("person")
  .select("id, email, full_name, is_builder, is_producer, status, auth_user_id")
  .ilike("email", email)
  .maybeSingle();
if (selErr) throw selErr;

if (existing) {
  const { data, error } = await admin
    .from("person")
    .update({
      is_builder: true,
      is_producer: true,
      status: "active",
      full_name: fullName || existing.full_name,
    })
    .eq("id", existing.id)
    .select("id, email, full_name, is_builder, is_producer, status, auth_user_id")
    .single();
  if (error) throw error;
  console.log("Updated existing person row -> builder:");
  console.log(data);
} else {
  const { data, error } = await admin
    .from("person")
    .insert({
      email,
      full_name: fullName || email,
      is_builder: true,
      is_producer: true,
      status: "active",
    })
    .select("id, email, full_name, is_builder, is_producer, status, auth_user_id")
    .single();
  if (error) throw error;
  console.log("Created new person row -> builder:");
  console.log(data);
}

console.log(`\nDone. Sign in at /auth/signin with ${email} (magic link).`);
