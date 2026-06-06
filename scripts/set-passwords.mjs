// Set (or reset) passwords for specific accounts — used to give real users a
// password directly, outside the invite flow. Idempotent.
//
//   node --env-file=.env.local scripts/set-passwords.mjs <email> <password> [<email> <password> ...]
//
// For each pair: creates the auth user if missing (email pre-confirmed) or
// updates the password if it already exists, then links person.auth_user_id by
// email so they land in their portal — not onboarding — on first sign-in.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/set-passwords.mjs <email> <password> ...",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error(
    "Usage: node --env-file=.env.local scripts/set-passwords.mjs <email> <password> [<email> <password> ...]",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
}

async function ensureAuthUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user;

  const existing = await findAuthUserByEmail(email);
  if (!existing) throw error ?? new Error(`Could not create or find ${email}`);
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  return existing;
}

for (let i = 0; i < args.length; i += 2) {
  const email = args[i].trim().toLowerCase();
  const password = args[i + 1];

  const user = await ensureAuthUser(email, password);
  console.log(`  password set  ${email}`);

  // Link a pre-existing person row so password sign-in (which never hits
  // /auth/callback) still resolves to their portal instead of onboarding.
  const { data: person } = await admin
    .from("person")
    .select("id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  if (person && !person.auth_user_id) {
    await admin
      .from("person")
      .update({ auth_user_id: user.id })
      .eq("id", person.id);
    console.log(`  linked person ${email}`);
  } else if (!person) {
    console.log(`  (no person row for ${email} — they'll see onboarding)`);
  }
}

console.log("\nDone.");
