import { redirect } from "next/navigation";
import { advancePhase, setStep } from "@/lib/actions/pipeline";
import type { Recruit } from "@/lib/db/types";
import { Button } from "@/components/ui";

async function advanceForm(formData: FormData) {
  "use server";
  const recruitId = String(formData.get("recruitId") ?? "");
  const toPhase = String(formData.get("toPhase") ?? "") as
    | "onboarding"
    | "bootcamp";
  const result = await advancePhase(recruitId, toPhase);
  if (!result.ok) {
    redirect(
      `/dashboard/recruits/${recruitId}?error=${encodeURIComponent(result.error)}`,
    );
  }
  redirect(`/dashboard/recruits/${recruitId}?ok=advanced`);
}

async function stepForm(formData: FormData) {
  "use server";
  const recruitId = String(formData.get("recruitId") ?? "");
  const toStep = String(formData.get("toStep") ?? "") as
    | "roleplay"
    | "contracting";
  const result = await setStep(recruitId, toStep);
  if (!result.ok) {
    redirect(
      `/dashboard/recruits/${recruitId}?error=${encodeURIComponent(result.error)}`,
    );
  }
  redirect(`/dashboard/recruits/${recruitId}?ok=stepped`);
}

export default function BuilderActions({
  recruit,
  onboardingAssignmentsTotal,
  onboardingAssignmentsDone,
}: {
  recruit: Recruit;
  onboardingAssignmentsTotal: number;
  onboardingAssignmentsDone: number;
}) {
  if (recruit.removed_at) {
    return (
      <p className="rounded-2xl border border-hairline px-4 py-3 text-sm text-mute">
        Removed — no further actions.
      </p>
    );
  }

  if (recruit.phase === "graduated") {
    return (
      <p className="rounded-2xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
        Graduated — Road to 40k is V2.
      </p>
    );
  }

  if (recruit.phase === "licensing") {
    const canConfirm = recruit.phase_step === "exam_passed";
    return (
      <div className="rounded-2xl border border-hairline bg-card p-5">
        <p className="text-sm text-subtle">
          Confirm the recruit&#x2019;s exam pass and fingerprints to move them
          to onboarding.
        </p>
        <form action={advanceForm} className="mt-3">
          <input type="hidden" name="recruitId" value={recruit.id} />
          <input type="hidden" name="toPhase" value="onboarding" />
          <Button type="submit" variant="primary" disabled={!canConfirm}>
            Confirm exam — advance to Onboarding
          </Button>
        </form>
        {!canConfirm ? (
          <p className="mt-2 text-xs text-mute">
            Available once the recruit has marked exam passed and submitted
            fingerprints.
          </p>
        ) : null}
      </div>
    );
  }

  if (recruit.phase === "onboarding") {
    const step = recruit.phase_step;
    return (
      <div className="rounded-2xl border border-hairline bg-card p-5">
        <p className="text-sm text-subtle">
          Assignments complete: {onboardingAssignmentsDone}/
          {onboardingAssignmentsTotal}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {step === "training" ? (
            <form action={stepForm}>
              <input type="hidden" name="recruitId" value={recruit.id} />
              <input type="hidden" name="toStep" value="roleplay" />
              <Button
                type="submit"
                disabled={
                  onboardingAssignmentsDone < onboardingAssignmentsTotal
                }
              >
                Advance to roleplay
              </Button>
            </form>
          ) : null}
          {step === "roleplay" ? (
            <form action={stepForm}>
              <input type="hidden" name="recruitId" value={recruit.id} />
              <input type="hidden" name="toStep" value="contracting" />
              <Button type="submit">
                Roleplay passed — advance to contracting
              </Button>
            </form>
          ) : null}
          {step === "contracting" ? (
            <form action={advanceForm}>
              <input type="hidden" name="recruitId" value={recruit.id} />
              <input type="hidden" name="toPhase" value="bootcamp" />
              <Button type="submit" variant="primary">
                Contracting done — start Bootcamp
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  if (recruit.phase === "bootcamp") {
    return (
      <p className="rounded-2xl border border-hairline px-4 py-3 text-sm text-mute">
        Bootcamp runs automatically. Graduation triggers at 8 submissions in 28
        days.
      </p>
    );
  }

  return null;
}
