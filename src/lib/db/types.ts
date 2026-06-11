// Shared enums and type aliases for the All Star OS schema.
// Keep these in lock-step with the CHECK constraints in supabase/migrations.

export type Phase =
  | "interview"
  | "licensing"
  | "onboarding"
  | "bootcamp"
  | "graduated";

export const PHASES: Phase[] = [
  "interview",
  "licensing",
  "onboarding",
  "bootcamp",
  "graduated",
];

export type LicensingStep =
  | "logged_in"
  | "exam_scheduled"
  | "studying"
  | "exam_passed";

export type OnboardingStep = "training" | "roleplay" | "contracting";

export type BootcampStep = "active";

export type PhaseStep = LicensingStep | OnboardingStep | BootcampStep;

export type MilestoneKind =
  | "first_dial"
  | "first_presentation"
  | "first_policy"
  | "first_deposit";

export const MILESTONE_KINDS: MilestoneKind[] = [
  "first_dial",
  "first_presentation",
  "first_policy",
  "first_deposit",
];

export type PersonStatus = "active" | "removed";

// Section 6 — single configurable stall threshold for "lapsed check-ins".
export const STALL_LAPSE_DAYS = 3;

// Section 5.4 — bootcamp 28-day shell.
export const BOOTCAMP_WINDOW_DAYS = 28;
export const BOOTCAMP_POLICY_GATE = 8;

export type Person = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  upline_id: string | null;
  is_builder: boolean;
  is_producer: boolean;
  is_owner: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  status: PersonStatus;
  // Builder-only settings (see migration 20260610000100_builder_settings.sql).
  admin_email: string | null;
  xcel_code: string | null;
  discord_webhook_url: string | null;
  // Policy-summary contact override (see 20260611000300_policy_contact.sql).
  // Falls back to full_name/email/phone when blank.
  policy_contact_name: string | null;
  policy_contact_email: string | null;
  policy_contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Recruit = {
  id: string;
  person_id: string;
  builder_id: string;
  phase: Phase;
  phase_step: PhaseStep | null;
  phone: string | null;
  state: string | null;
  exam_date: string | null;
  exam_failures: number;
  guide_read_at: string | null;
  licensing_submitted_at: string | null;
  bootcamp_started_at: string | null;
  flagged: boolean;
  flag_reason: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BuilderReferral = {
  builder_id: string;
  code: string;
  created_at: string;
};

export type CheckIn = {
  id: string;
  recruit_id: string;
  check_in_date: string;
  summary: string;
  pacing: Record<string, number> | null;
  actuals: Record<string, number> | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  recruit_id: string;
  sender_person_id: string | null;
  body: string;
  is_ai: boolean;
  /** Which conversation this belongs to: the human builder chat or the AI
   * assistant (Casey) thread. */
  channel: "builder" | "assistant";
  created_at: string;
};

export type Milestone = {
  id: string;
  recruit_id: string;
  kind: MilestoneKind;
  reached_at: string;
};

export type PolicySubmission = {
  id: string;
  recruit_id: string;
  submitted_at: string;
  note: string | null;
};

export type TrainingLesson = {
  id: string;
  title: string;
  video_url: string | null;
  phase: "licensing" | "onboarding";
  sort_order: number;
  is_assignment: boolean;
};

export type LessonCompletion = {
  id: string;
  recruit_id: string;
  lesson_id: string;
  completed_at: string;
};

export type MotivationalVideo = {
  id: string;
  title: string;
  video_url: string | null;
  sort_order: number;
};
