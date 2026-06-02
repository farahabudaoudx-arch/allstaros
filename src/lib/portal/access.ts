import type { LicensingStep, Recruit } from "@/lib/db/types";

// Linear ranking of the licensing steps, mirrored from licensing-view.
const LICENSING_RANK: Record<LicensingStep, number> = {
  logged_in: 0,
  exam_scheduled: 1,
  studying: 2,
  exam_passed: 3,
};

/**
 * Recruits in licensing keep Training / Check-in / Get Help locked until they've
 * scheduled the exam (step 1) AND gotten their study login (step 2). Everyone
 * past licensing has full access.
 */
export function portalFeaturesUnlocked(
  recruit: Pick<Recruit, "phase" | "phase_step">,
): boolean {
  if (recruit.phase !== "licensing") return true;
  const rank = LICENSING_RANK[(recruit.phase_step as LicensingStep) ?? "logged_in"] ?? 0;
  return rank >= LICENSING_RANK.studying;
}
