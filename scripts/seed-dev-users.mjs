// Seed the three dev "sign in as" accounts (recruit / producer / builder).
// Idempotent. Run against your dev Supabase project:
//
//   node --env-file=.env.local scripts/seed-dev-users.mjs
//
// Creates real auth.users (so getUser()/RLS behave exactly like prod), then
// upserts matching person rows with additive role flags and a recruit row under
// the builder so the dashboard isn't empty.

import { createClient } from "@supabase/supabase-js";
import accounts from "../src/lib/devAccounts.json" with { type: "json" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEV_LOGIN_PASSWORD ?? "allstar-dev-login";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/seed-dev-users.mjs",
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

async function ensureAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user;

  // Already registered — find it and make sure the password matches.
  const existing = await findAuthUserByEmail(email);
  if (!existing) throw error ?? new Error(`Could not create or find ${email}`);
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  return existing;
}

// Pass 1: ensure auth users + person rows, capturing person.id per role.
const personIdByRole = {};
for (const acc of accounts) {
  const user = await ensureAuthUser(acc.email);
  const { data: person, error } = await admin
    .from("person")
    .upsert(
      {
        auth_user_id: user.id,
        full_name: acc.fullName,
        email: acc.email,
        is_builder: acc.is_builder,
        is_producer: acc.is_producer,
        is_admin: acc.is_admin ?? false,
        is_super_admin: acc.is_super_admin ?? false,
        status: "active",
      },
      { onConflict: "auth_user_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  personIdByRole[acc.role] = person.id;
  console.log(`  person  ${acc.role.padEnd(8)} ${acc.email}`);
}

// Pass 2: place the recruit and the producer under the builder, each with a
// recruit row so the dashboard isn't empty and both can message their upline.
const builderId = personIdByRole.builder;

// [person.id, phase] for everyone who sits under the builder as their upline.
const downline = [
  [personIdByRole.recruit, "licensing"],
  // The producer keeps a recruit row (now "graduated") so they have an upline
  // thread to message — see /producer/upline.
  [personIdByRole.producer, "graduated"],
];

if (builderId) {
  for (const [personId, phase] of downline) {
    if (!personId) continue;
    await admin.from("person").update({ upline_id: builderId }).eq("id", personId);

    const { data: existingRecruit } = await admin
      .from("recruit")
      .select("id")
      .eq("person_id", personId)
      .maybeSingle();

    if (!existingRecruit) {
      const { error } = await admin.from("recruit").insert({
        person_id: personId,
        builder_id: builderId,
        phase,
      });
      if (error) throw error;
      console.log(`  recruit row created under builder (${phase})`);
    } else {
      console.log("  recruit row already exists");
    }
  }
}

console.log("\nDone. Sign in at /auth/dev (dev only).");
