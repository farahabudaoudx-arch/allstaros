// One-off: upsert live-training rows into training_schedule.
// Usage: node --env-file=.env.local scripts/upload-trainings.mjs [path-to-json]
// JSON is an array of training_schedule rows (keyed/deduped by `slug`).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const path = process.argv[2] || "/tmp/trainings.json";
const rows = JSON.parse(readFileSync(path, "utf8"));

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from("training_schedule")
  .upsert(rows, { onConflict: "slug" })
  .select("slug, event_date, host, title");

if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}
console.log(`Upserted ${data.length} trainings:`);
for (const r of data.sort((a, b) => a.event_date.localeCompare(b.event_date))) {
  console.log(`  ${r.event_date}  ${r.host} — ${r.title}`);
}
