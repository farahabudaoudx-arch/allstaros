// Inspect a person row + related rows before any destructive cleanup.
//   node --env-file=.env.local scripts/inspect-person.mjs "email@example.com"
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim();
if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/inspect-person.mjs "email"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: person, error } = await admin
  .from("person")
  .select("*")
  .ilike("email", email)
  .maybeSingle();
if (error) throw error;

console.log("=== person ===");
console.log(person ?? "(none)");

if (person) {
  const { data: recruits } = await admin
    .from("recruit")
    .select("*")
    .eq("person_id", person.id);
  console.log("\n=== recruit rows (person_id) ===");
  console.log(recruits ?? "(none)");
}

const { data: authList } = await admin.auth.admin.listUsers();
const authUser = (authList?.users ?? []).find(
  (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
);
console.log("\n=== auth.users ===");
console.log(authUser ? { id: authUser.id, email: authUser.email, created_at: authUser.created_at } : "(none)");
