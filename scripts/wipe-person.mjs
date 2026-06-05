// One-off: fully remove a dummy person + their recruit row + auth user.
//   node --env-file=.env.local scripts/wipe-person.mjs "email@example.com"
//
// Aborts if anyone else depends on this person via a `restrict` FK
// (another person's upline_id, or a recruit's builder_id) so we never
// orphan real data. recruit children (exam_attempts, etc.) cascade.
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim();
if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/wipe-person.mjs "email"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: person, error: selErr } = await admin
  .from("person")
  .select("id, email, auth_user_id, is_builder, is_producer")
  .ilike("email", email)
  .maybeSingle();
if (selErr) throw selErr;
if (!person) {
  console.log(`No person row for ${email}. Nothing to wipe.`);
  process.exit(0);
}

// Safety: refuse if anyone else depends on this person.
const { data: downline } = await admin
  .from("person")
  .select("id, email")
  .eq("upline_id", person.id);
if (downline && downline.length) {
  console.error(`ABORT: ${downline.length} person row(s) have this person as upline_id:`);
  console.error(downline);
  process.exit(1);
}
const { data: leadsAsBuilder } = await admin
  .from("recruit")
  .select("id")
  .eq("builder_id", person.id);
if (leadsAsBuilder && leadsAsBuilder.length) {
  console.error(`ABORT: ${leadsAsBuilder.length} recruit row(s) have this person as builder_id.`);
  process.exit(1);
}

// 1. Delete this person's own recruit row(s); cascades exam_attempts etc.
const { data: delRecruits, error: recErr } = await admin
  .from("recruit")
  .delete()
  .eq("person_id", person.id)
  .select("id");
if (recErr) throw recErr;
console.log(`Deleted ${delRecruits?.length ?? 0} recruit row(s).`);

// 2. Delete the person row (cascades producer_* / clients / goals / projections).
const { error: persErr } = await admin.from("person").delete().eq("id", person.id);
if (persErr) throw persErr;
console.log(`Deleted person ${person.id}.`);

// 3. Delete the auth user so a fresh magic-link sign-in starts clean.
if (person.auth_user_id) {
  const { error: authErr } = await admin.auth.admin.deleteUser(person.auth_user_id);
  if (authErr) throw authErr;
  console.log(`Deleted auth user ${person.auth_user_id}.`);
} else {
  console.log("No linked auth user.");
}

console.log(`\nWipe complete for ${email}.`);
