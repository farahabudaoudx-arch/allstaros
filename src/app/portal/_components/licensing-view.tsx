import {
  saveExamDateForm,
  markExamScheduledForm,
  markStudyingForm,
  markExamPassedForm,
  markLicensingSubmittedForm,
  markGuideReadForm,
} from "@/lib/actions/portal";
import type { LicensingStep, Recruit } from "@/lib/db/types";
import { Input, buttonClass } from "@/components/ui";
import { examSiteForState } from "@/lib/exam-sites";
import { US_STATES } from "@/lib/us-states";
import {
  Timeline,
  TimelineStep,
  TimelineFinale,
  type StepStatus,
} from "./timeline";
import { SubmitButton } from "./submit-button";

// Placeholder external links + videos — swap these for the real destinations.
const XCEL_LOGIN_URL = "https://xcelsolutions.com/login";
const XCEL_CODE = "FFLALLSTAR-NGBNCR";
const SIRCON_URL = "https://www.sircon.com";
const INTRO_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const SCHEDULE_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const STUDY_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const EXAM_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const SIRCON_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";

// Linear progression of the licensing phase. One timeline step per rung.
const STEP_ORDER: Record<LicensingStep, number> = {
  logged_in: 0,
  exam_scheduled: 1,
  studying: 2,
  exam_passed: 3,
};

export default function LicensingView({
  recruit,
  uplineName,
  justUnlocked,
}: {
  recruit: Recruit;
  // The recruit's upline (builder) name, shown on the closing success card.
  uplineName?: string | null;
  // The `ok` flash from the action that just ran, so the newly-unlocked step
  // can animate from blurred → clear on this load.
  justUnlocked?: string;
}) {
  // How far along the recruit is, straight from phase_step. Saving an exam date
  // no longer advances the step on its own — the recruit has to click "Mark as
  // completed", which is what moves logged_in → exam_scheduled.
  const current =
    STEP_ORDER[(recruit.phase_step as LicensingStep) ?? "logged_in"] ?? 0;

  // The intro video is a soft gate that sits in front of everything. It's
  // satisfied once guide_read_at is stamped (reused as the "watched" marker), or
  // implicitly once the recruit has moved past scheduling (so people already
  // underway aren't sent back to re-watch).
  const guideRead = !!recruit.guide_read_at;
  const guideComplete = guideRead || current >= STEP_ORDER.exam_scheduled;
  const stepGuide: StepStatus = guideComplete ? "complete" : "active";

  // A step is complete once we're past its rung, active when we're sitting on
  // the rung just before it, and locked otherwise. Everything stays locked until
  // the guide gate clears.
  const statusFor = (rung: number): StepStatus => {
    if (!guideComplete) return "locked";
    if (current >= rung) return "complete";
    if (current === rung - 1) return "active";
    return "locked";
  };

  // State-aware exam booking: map the recruit's onboarding state to its exam
  // vendor + scheduling URL, shown inline on the step 02 card.
  const examSite = examSiteForState(recruit.state);
  const stateLabel =
    US_STATES.find((s) => s.code === (recruit.state ?? "").toUpperCase())?.name ??
    null;

  const step02 = statusFor(STEP_ORDER.exam_scheduled);
  const step03 = statusFor(STEP_ORDER.studying);
  const step04 = statusFor(STEP_ORDER.exam_passed);
  // Step 05 sits above the phase_step ladder — its own done-marker is
  // licensing_submitted_at, stamped when the recruit marks the Sircon step
  // complete. Active once the exam is passed, complete once that's stamped.
  const licensingSubmitted = !!recruit.licensing_submitted_at;
  const step05: StepStatus = licensingSubmitted
    ? "complete"
    : guideComplete && current >= STEP_ORDER.exam_passed
      ? "active"
      : "locked";
  // Closing success card — clears only after that final "Mark as completed".
  const finaleStatus: StepStatus = licensingSubmitted ? "active" : "locked";
  const uplineDisplay = uplineName?.trim() || "Your upline";

  // All steps stay on screen — locked ones are blurred. When an action just
  // unlocked the next step, animate that one unblurring. The `ok` flash maps to
  // the step that became active as a result.
  const animateStep =
    justUnlocked === "guide-read"
      ? "02"
      : justUnlocked === "exam-scheduled"
        ? "03"
        : justUnlocked === "studying"
          ? "04"
          : justUnlocked === "exam-passed"
            ? "05"
            : null;

  return (
    <Timeline>
        {/* 01 — Watch the intro video (soft gate) */}
        <TimelineStep
          number="01"
          title="Watch this video first"
          description="In this short video we're going to show you how to pass your exam on your first try."
          status={stepGuide}
        >
          <div className="space-y-4">
            <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={INTRO_VIDEO}
                title="How to pass your exam on the first try"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            {stepGuide === "active" ? (
              <form action={markGuideReadForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Mark as completed
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </TimelineStep>

        {/* 02 — Schedule the state exam */}
        <TimelineStep
          number="02"
          title="Schedule your state exam"
          description={
            step02 === "complete"
              ? `Booked for ${recruit.exam_date}. Your study login unlocks below.`
              : "Click below to schedule your exam."
          }
          status={step02}
          animateUnlock={animateStep === "02"}
        >
          <div className="space-y-4">
            <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={SCHEDULE_VIDEO}
                title="How to schedule your state exam"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>

            {examSite ? (
              <div className="space-y-3">
                {stateLabel ? (
                  <p className="text-sm leading-relaxed text-subtle">
                    You&apos;re getting licensed in{" "}
                    <span className="font-semibold text-ink">{stateLabel}</span>,
                    which tests through{" "}
                    <span className="font-semibold text-ink">
                      {examSite.vendor}
                    </span>
                    . Watch the video, then book your exam below.
                  </p>
                ) : null}
                <a
                  href={examSite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary")}
                >
                  Schedule with {examSite.vendor} →
                </a>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-hairline px-4 py-5 text-sm text-mute">
                We couldn&apos;t match a testing center to your state. Reach out
                to your builder and they&apos;ll point you to the right place to
                schedule.
              </p>
            )}

            <form
              action={saveExamDateForm}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <input type="hidden" name="recruitId" value={recruit.id} />
              <div className="flex-1">
                <label
                  htmlFor="examDate"
                  className="block font-mono text-[10px] uppercase tracking-[0.16em] text-mute"
                >
                  Exam date
                </label>
                <Input
                  id="examDate"
                  name="examDate"
                  type="date"
                  defaultValue={recruit.exam_date ?? ""}
                  required
                  className="mt-1.5"
                />
              </div>
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                {recruit.exam_date ? "Update date" : "Save date"}
              </SubmitButton>
            </form>

            {/* Advance gate: locked until a date is saved, then it moves the
                recruit forward. */}
            {step02 === "active" ? (
              recruit.exam_date ? (
                <form action={markExamScheduledForm}>
                  <input type="hidden" name="recruitId" value={recruit.id} />
                  <input
                    type="hidden"
                    name="examDate"
                    value={recruit.exam_date}
                  />
                  <SubmitButton variant="primary" pendingLabel="Saving…">
                    Mark as completed
                  </SubmitButton>
                </form>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Save your exam date first"
                  className={buttonClass(
                    "primary",
                    "cursor-not-allowed opacity-50",
                  )}
                >
                  Mark as completed
                </button>
              )
            ) : null}
          </div>
        </TimelineStep>

        {/* 03 — Study login */}
        <TimelineStep
          number="03"
          title="Get your study login"
          description={
            step03 === "complete"
              ? "You're studying. Keep working through the course until exam day."
              : "Your Xcel Solutions account is your exam prep. Log in, then mark this done."
          }
          status={step03}
          animateUnlock={animateStep === "03"}
        >
          <div className="space-y-4">
            <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={STUDY_VIDEO}
                title="How to get your study login"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>

            <div className="rounded-xl border border-hairline bg-card px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                Your enrollment code
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tracking-[0.08em] text-ink">
                {XCEL_CODE}
              </p>
            </div>

            <a
              href={XCEL_LOGIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary")}
            >
              Open Xcel Solutions →
            </a>
            {step03 === "active" ? (
              <form action={markStudyingForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Mark as completed
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </TimelineStep>

        {/* 04 — Pass the exam */}
        <TimelineStep
          number="04"
          title="Pass your exam"
          description="Show up to your testing center on exam day, then tell us how it went."
          status={step04}
          animateUnlock={animateStep === "04"}
        >
          <div className="space-y-4">
            <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={EXAM_VIDEO}
                title="Passing your state exam"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            {step04 === "active" ? (
              <form action={markExamPassedForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <SubmitButton variant="primary" pendingLabel="Saving…">
                  Mark as completed
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </TimelineStep>

        {/* 05 — Apply for the license on Sircon */}
        <TimelineStep
          number="05"
          title="Apply for your license on Sircon"
          description="Once you've passed and submitted fingerprints, apply for your license on Sircon. Watch the video, then click below."
          status={step05}
          animateUnlock={animateStep === "05"}
        >
          <div className="space-y-4">
            <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={SIRCON_VIDEO}
                title="How to apply for your license on Sircon"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            {step05 === "active" ? (
              <>
                <a
                  href={SIRCON_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary")}
                >
                  Apply on Sircon →
                </a>
                <form action={markLicensingSubmittedForm}>
                  <input type="hidden" name="recruitId" value={recruit.id} />
                  <SubmitButton variant="primary" pendingLabel="Saving…">
                    Mark as completed
                  </SubmitButton>
                </form>
              </>
            ) : null}
          </div>
        </TimelineStep>

        {/* Closing success card — no step number, just the congrats message. */}
        <TimelineFinale status={finaleStatus}>
          <p className="text-base font-semibold text-ink">
            You&apos;re all set on your end.
          </p>
          <p className="mt-2 text-sm text-subtle">
            <span className="font-semibold text-ink">{uplineDisplay}</span> will
            be notified and you&apos;ll receive your next steps shortly. Congrats!
          </p>
        </TimelineFinale>
      </Timeline>
  );
}
