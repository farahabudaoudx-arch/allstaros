import type { Recruit } from "@/lib/db/types";

// The recruiting funnel is a builder-facing view: a finer-grained ordering than
// the raw phase/step model, derived from the recruit's progress fields. Each
// recruit occupies exactly one stage — the furthest point they've reached.

export type FunnelStage =
  | "signed_up"
  | "watched_video"
  | "scheduled_exam"
  | "studying"
  | "exam_result"
  | "license_pending"
  | "license_approved"
  | "contracting"
  | "in_bootcamp"
  | "bootcamp_result";

export type FunnelOutcome = "passed" | "failed";

export const FUNNEL_STAGES: {
  key: FunnelStage;
  label: string;
  /** Stages rendered as two side-by-side boxes (Exam, Bootcamp). */
  split?: { passed: string; failed: string };
}[] = [
  { key: "signed_up", label: "Signed Up" },
  { key: "watched_video", label: "Watched 1st Video" },
  { key: "scheduled_exam", label: "Scheduled Exam" },
  { key: "studying", label: "Studying" },
  {
    key: "exam_result",
    label: "Exam",
    split: { passed: "Passed Exam", failed: "Failed Exam" },
  },
  { key: "license_pending", label: "License Pending" },
  { key: "license_approved", label: "License Approved" },
  { key: "contracting", label: "Contracting" },
  { key: "in_bootcamp", label: "In Bootcamp" },
  {
    key: "bootcamp_result",
    label: "Bootcamp",
    split: { passed: "Passed Bootcamp", failed: "Failed Bootcamp" },
  },
];

export function funnelStageLabel(stage: FunnelStage, outcome?: FunnelOutcome): string {
  const meta = FUNNEL_STAGES.find((s) => s.key === stage);
  if (!meta) return stage;
  if (meta.split && outcome) {
    return outcome === "passed" ? meta.split.passed : meta.split.failed;
  }
  return meta.label;
}

type DerivableRecruit = Pick<
  Recruit,
  | "phase"
  | "phase_step"
  | "guide_read_at"
  | "exam_failures"
  | "licensing_submitted_at"
  | "flagged"
>;

export function deriveFunnelStage(r: DerivableRecruit): {
  stage: FunnelStage;
  outcome?: FunnelOutcome;
} {
  if (r.phase === "graduated") return { stage: "bootcamp_result", outcome: "passed" };

  if (r.phase === "bootcamp") {
    return r.flagged
      ? { stage: "bootcamp_result", outcome: "failed" }
      : { stage: "in_bootcamp" };
  }

  if (r.phase === "onboarding") {
    // Reaching onboarding means the license was approved.
    return r.phase_step === "contracting"
      ? { stage: "contracting" }
      : { stage: "license_approved" };
  }

  if (r.phase === "licensing") {
    if (r.phase_step === "exam_passed") {
      // Passed the exam; once the license application is submitted they're
      // waiting on approval.
      return r.licensing_submitted_at
        ? { stage: "license_pending" }
        : { stage: "exam_result", outcome: "passed" };
    }
    if (r.exam_failures > 0) return { stage: "exam_result", outcome: "failed" };
    if (r.phase_step === "studying") return { stage: "studying" };
    if (r.phase_step === "exam_scheduled") return { stage: "scheduled_exam" };
    return r.guide_read_at ? { stage: "watched_video" } : { stage: "signed_up" };
  }

  // interview phase — just in the door
  return { stage: "signed_up" };
}
