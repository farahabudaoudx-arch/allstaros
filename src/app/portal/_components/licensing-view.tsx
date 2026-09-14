import {
  saveExamDateForm,
  markExamScheduledForm,
  markStudyingForm,
  markExamPassedForm,
  markLicensingSubmittedForm,
  markGuideReadForm,
} from "@/lib/actions/portal";
import type { LicensingStep, Recruit } from "@/lib/db/types";
import type { LicensingVideo, LicensingVideos } from "@/lib/bunny";
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
import { CopyButton } from "./copy-button";

export type LicensingInstallationSettings = {
  providerName: string;
  code: string;
  loginUrl: string;
  requirementsUrl: string;
  applicationUrl: string;
};

// Renders a step's video player, or nothing if that video isn't in Bunny yet.
// autoplay=false so videos never fire on load; border:0 + no container border
// so the Bunny player has no white edge lines. The frame is sized to the clip's
// own aspect ratio (falling back to 16:9) so the player never letterboxes an
// off-16:9 video — letterbox bars were showing as thin white lines in the frame.
function StepVideo({ video, title }: { video: LicensingVideo; title: string }) {
  if (!video.url) return null;
  return (
    <div
      className="w-full max-w-2xl overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: video.ratio ?? 16 / 9 }}
    >
      <iframe
        src={`${video.url}?autoplay=false&preload=true`}
        title={title}
        loading="lazy"
        allow="accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="h-full w-full"
        style={{ border: 0 }}
      />
    </div>
  );
}

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
  adminEmail,
  videos,
  licensing,
  justUnlocked,
}: {
  recruit: Recruit;
  // The recruit's upline (builder) name, shown on the closing success card.
  uplineName?: string | null;
  // The builder's admin email — where the recruit sends contracting info,
  // shown as a copy field on the "Get contracted" step.
  adminEmail?: string | null;
  // The 5 licensing how-to videos from the Bunny "tutorials" library.
  videos: LicensingVideos;
  licensing: LicensingInstallationSettings;
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
  // Native floor for the exam-date picker — recruits can only book a future
  // date. The server action re-checks this on submit.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;
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
          title="Step 1: Watch This Video Before You Do Anything"
          status={stepGuide}
        >
          <div className="space-y-4">
            <StepVideo video={videos.intro} title="Watch this before you do anything" />
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
          title="Step 2: Schedule Your State Exam"
          status={step02}
          animateUnlock={animateStep === "02"}
        >
          <div className="space-y-4">
            <StepVideo video={videos.schedule} title="How to schedule your state exam" />

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
                  className="block text-[10px] uppercase tracking-[0.16em] text-mute"
                >
                  Exam date
                </label>
                <Input
                  id="examDate"
                  name="examDate"
                  type="date"
                  defaultValue={recruit.exam_date ?? ""}
                  min={todayIso}
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
          title="Step 3: Get Your Study Portal Login"
          status={step03}
          animateUnlock={animateStep === "03"}
        >
          <div className="space-y-4">
            <StepVideo video={videos.study} title="How to get your study login" />

            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mute">
                  Your enrollment code
                </p>
                <p className="mt-1 truncate text-lg font-semibold tracking-[0.08em] text-ink">
                  {licensing.code}
                </p>
              </div>
              <CopyButton value={licensing.code} />
            </div>

            <a
              href={licensing.loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary")}
            >
              Open {licensing.providerName} →
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

        {/* 04 — Pass the exam + apply for the license on Sircon */}
        <TimelineStep
          title="Step 4: Pass Your Exam + Get Your License"
          status={step04}
          animateUnlock={animateStep === "04"}
        >
          <div className="space-y-4">
            <StepVideo video={videos.exam} title="Passing your state exam + getting your license" />
            {step04 === "active" ? (
              <>
                <a
                  href={licensing.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary")}
                >
                  Apply for your license on Sircon →
                </a>
                <a
                  href={licensing.requirementsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary")}
                >
                  View license requirements →
                </a>
                <form action={markExamPassedForm}>
                  <input type="hidden" name="recruitId" value={recruit.id} />
                  <SubmitButton variant="primary" pendingLabel="Saving…">
                    Passed + Got My License
                  </SubmitButton>
                </form>
              </>
            ) : null}
          </div>
        </TimelineStep>

        {/* 05 — Get contracted (send contracting info to the builder's admin) */}
        <TimelineStep
          title="Final Step: Get Contracted"
          status={step05}
          animateUnlock={animateStep === "05"}
        >
          <div className="space-y-4">
            <StepVideo video={videos.contracting} title="How to get contracted" />
            {step05 === "active" ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-mute">
                      Send your contracting info to
                    </p>
                    <p className="mt-1 truncate text-lg font-semibold tracking-[0.04em] text-ink">
                      {adminEmail || "Ask your upline for the admin email"}
                    </p>
                  </div>
                  {adminEmail ? <CopyButton value={adminEmail} /> : null}
                </div>
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
            <span className="font-semibold text-ink">{uplineDisplay}</span>{" "}
            will be notified and you&apos;ll receive your next steps shortly.
            Congrats!
          </p>
        </TimelineFinale>
      </Timeline>
  );
}
