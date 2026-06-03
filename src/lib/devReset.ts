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

  // Best-effort: also clear the step-5 marker. Kept as a separate statement so
  // the reset above still succeeds before the licensing_submitted_at migration
  // has been run — until then this column doesn't exist and the error is
  // harmlessly ignored.
  await admin
    .from("recruit")
    .update({ licensing_submitted_at: null })
    .eq("person_id", personId);
}

/**
 * Dev-only: jump the seeded recruit to the END of licensing — every step
 * completed — so the portal opens fully unlocked and the whole flow (Training,
 * Check-in, All Star AI, Messages, plus the completed licensing finale) is
 * visible without re-walking each step. The mirror image of the reset above.
 * Never runs outside the DEV_LOGIN_ENABLED gate.
 */
export async function advanceDevRecruitByPersonId(personId: string) {
  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  await admin
    .from("recruit")
    .update({
      phase: "licensing",
      phase_step: "exam_passed",
      exam_date: today,
      exam_failures: 0,
      guide_read_at: nowIso,
      bootcamp_started_at: null,
    })
    .eq("person_id", personId);

  // Separate statement so the advance above still succeeds before the
  // licensing_submitted_at migration has run (column may not exist yet).
  await admin
    .from("recruit")
    .update({ licensing_submitted_at: nowIso })
    .eq("person_id", personId);
}
