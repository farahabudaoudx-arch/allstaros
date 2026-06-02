import type { Phase, PhaseStep } from "@/lib/db/types";

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "interview":
      return "Interview";
    case "licensing":
      return "Licensing";
    case "onboarding":
      return "Onboarding";
    case "bootcamp":
      return "Bootcamp";
    case "graduated":
      return "Graduated — Rookie / Road to 40k";
  }
}

export function phaseStepLabel(step: PhaseStep | null): string {
  if (!step) return "—";
  switch (step) {
    case "logged_in":
      return "Logged in";
    case "exam_scheduled":
      return "Exam scheduled";
    case "studying":
      return "Studying";
    case "exam_passed":
      return "Exam passed";
    case "training":
      return "Training";
    case "roleplay":
      return "Roleplay";
    case "contracting":
      return "Contracting";
    case "active":
      return "Active";
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
