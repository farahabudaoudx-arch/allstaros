import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Dev-only: wipe the seeded recruit's licensing progress so the portal always
 * opens on step 1 with nothing filled in. Used both on dev login and on a fresh
 * (param-less) portal load, so the demo account never shows stale progress.
 * Never runs outside the DEV_LOGIN_ENABLED gate.
 */
export async function resetDevRecruitByPersonId(personId: string) {
  const admin = createServiceRoleClient();
  await admin
    .from("recruit")
    .update({
      phase: "licensing",
      phase_step: "logged_in",
      exam_date: null,
      exam_failures: 0,
      guide_read_at: null,
      bootcamp_started_at: null,
    })
    .eq("person_id", personId);
}
