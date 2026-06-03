import {
  setExamDateForm,
  markStudyingForm,
  markExamPassedForm,
  markExamFailedForm,
  markGuideReadForm,
} from "@/lib/actions/portal";
import type { LicensingStep, Recruit } from "@/lib/db/types";
import { Input, Button, buttonClass } from "@/components/ui";
import { Timeline, TimelineStep, type StepStatus } from "./timeline";
import { WalkthroughButton } from "./walkthrough-modal";
import { ExamFailModal } from "./exam-fail-modal";

// Placeholder external links + videos — swap these for the real destinations.
const SCHEDULE_EXAM_URL = "https://www.prometric.com";
const XCEL_LOGIN_URL = "https://xcelsolutions.com/login";
const FINGERPRINT_SCHEDULE_URL = "https://www.identogo.com";
const INTRO_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const EXAM_WALKTHROUGH_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const FINGERPRINT_WALKTHROUGH_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";

// Linear progression of the licensing phase. One timeline step per rung.
const STEP_ORDER: Record<LicensingStep, number> = {
  logged_in: 0,
  exam_scheduled: 1,
  studying: 2,
  exam_passed: 3,
};

export default function LicensingView({
  recruit,
  showFailModal = false,
  justUnlocked,
}: {
  recruit: Recruit;
  showFailModal?: boolean;
  // The `ok` flash from the action that just ran, so the newly-unlocked step
  // can animate from blurred → clear on this load.
  justUnlocked?: string;
}) {
  // How far along the recruit is. Fall back to the exam_date column in case the
  // step lagged behind (the column is independently client-updatable).
  let current = STEP_ORDER[(recruit.phase_step as LicensingStep) ?? "logged_in"] ?? 0;
  if (recruit.exam_date && current < STEP_ORDER.exam_scheduled) {
    current = STEP_ORDER.exam_scheduled;
  }

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

  const step02 = statusFor(STEP_ORDER.exam_scheduled);
  const step03 = statusFor(STEP_ORDER.studying);
  const step04 = statusFor(STEP_ORDER.exam_passed);
  // Step 05 has no rung above it inside licensing — it's the builder's gate.
  const step05: StepStatus =
    guideComplete && current >= STEP_ORDER.exam_passed ? "active" : "locked";

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
    <>
      <ExamFailModal open={showFailModal} />
      <Timeline>
        {/* 01 — Watch the intro video (soft gate) */}
        <TimelineStep
          number="01"
          title="Watch this video first"
          description={
            stepGuide === "complete"
              ? "Nice — you've watched the video that sets you up to pass on the first try."
              : "In this short video we're going to show you how to pass your exam on your first try."
          }
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
                <Button type="submit" variant="primary">
                  I watched the video
                </Button>
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
              : "Find your testing center, lock in a date, then save it here."
          }
          status={step02}
          animateUnlock={animateStep === "02"}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <a
                href={SCHEDULE_EXAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary")}
              >
                Find where to schedule →
              </a>
              <WalkthroughButton
                title="How to schedule your state exam"
                videoUrl={EXAM_WALKTHROUGH_VIDEO}
              />
            </div>

            <form
              action={setExamDateForm}
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
              <Button type="submit" variant="primary">
                {step02 === "complete" ? "Update date" : "Save date"}
              </Button>
            </form>
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
            <a
              href={XCEL_LOGIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary")}
            >
              Open Xcel Solutions →
            </a>
            {step03 === "active" ? (
              <form action={markStudyingForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <Button type="submit" variant="secondary">
                  I&apos;m logged in and studying
                </Button>
              </form>
            ) : null}
          </div>
        </TimelineStep>

        {/* 04 — Pass the exam */}
        <TimelineStep
          number="04"
          title="Pass your exam"
          description="Show up to your testing center on exam day. Mark how it went here."
          status={step04}
          animateUnlock={animateStep === "04"}
        >
          {step04 === "active" ? (
            <div className="flex flex-wrap gap-3">
              <form action={markExamPassedForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <Button type="submit" variant="primary">
                  I passed my exam
                </Button>
              </form>
              <form action={markExamFailedForm}>
                <input type="hidden" name="recruitId" value={recruit.id} />
                <Button type="submit" variant="secondary">
                  I failed my exam
                </Button>
              </form>
            </div>
          ) : null}
        </TimelineStep>

        {/* 05 — Fingerprints + builder approval */}
        <TimelineStep
          number="05"
          title="Submit fingerprints & get approved"
          description="Get fingerprinted, then your builder verifies everything and approves. Once they do, your portal unlocks Bootcamp."
          status={step05}
          animateUnlock={animateStep === "05"}
          isLast
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <a
                href={FINGERPRINT_SCHEDULE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary")}
              >
                Find where to schedule →
              </a>
              <WalkthroughButton
                title="How to submit your fingerprints"
                videoUrl={FINGERPRINT_WALKTHROUGH_VIDEO}
              />
            </div>
            <p className="rounded-xl border border-dashed border-hairline px-4 py-5 text-center text-sm text-mute">
              Waiting on your builder to verify your fingerprints and approve.
            </p>
          </div>
        </TimelineStep>
      </Timeline>
    </>
  );
}
