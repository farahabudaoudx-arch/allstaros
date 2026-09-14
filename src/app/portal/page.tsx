import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import LicensingView from "./_components/licensing-view";
import { getInstallationConfig } from "@/lib/installation/config";
import { effectiveLicensingSettings } from "@/lib/installation/licensing";
import OnboardingView from "./_components/onboarding-view";
import BootcampView from "./_components/bootcamp-view";
import GraduatedView from "./_components/graduated-view";
import PortalShell, { PortalHeading } from "./_components/portal-shell";
import { SubmitButton } from "./_components/submit-button";
import { phaseLabel } from "@/lib/pipeline/labels";
import { devAccountByRole } from "@/lib/devLogin";
import { resetLicensingForm, showFullFlowForm } from "@/lib/actions/portal";
import { getLicensingVideos } from "@/lib/bunny";
import { UnlockCelebration } from "./_components/unlock-celebration";
import type {
  CheckIn,
  LessonCompletion,
  Milestone,
  PolicySubmission,
  Recruit,
  TrainingLesson,
} from "@/lib/db/types";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    milestone?: string;
  }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal");
  if (person.is_builder) redirect("/producer");
  if (person.is_producer) redirect("/producer");
  if (person.is_admin || person.is_super_admin) redirect("/admin");

  const params = await searchParams;

  // Progress is account-based and sticks across sessions. There's no automatic
  // reset on load — the demo recruit clears their own progress with the
  // explicit "Reset to step 1" button below.

  const supabase = await createClient();

  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");

  // The recruit's upline (their builder) — name shown on the licensing finale
  // card, admin email shown on the "Get contracted" step as a copy field. RLS
  // won't let a recruit read UP the tree, so resolve via the service role (same
  // pattern as /welcome) — otherwise both come back null and the step shows
  // "Ask your upline for the admin email".
  const admin = createServiceRoleClient();
  const { data: uplineRow } = await admin
    .from("person")
    .select("full_name, admin_email, xcel_code")
    .eq("id", recruit.builder_id)
    .maybeSingle();
  const upline = uplineRow as {
    full_name: string;
    admin_email: string | null;
    xcel_code: string | null;
  } | null;
  const uplineName = upline?.full_name ?? null;
  const adminEmail = upline?.admin_email ?? null;
  const installation = await getInstallationConfig();
  const licensing = effectiveLicensingSettings(installation, upline?.xcel_code);

  // The 5 licensing how-to videos from the Bunny "tutorials" library.
  const licensingVideos = await getLicensingVideos();

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: lessonsRows },
    { data: completionsRows },
    { data: milestonesRows },
    { data: policiesRows },
    { data: checkInsRows },
    { data: latestCheckInRow },
  ] = await Promise.all([
    supabase.from("training_lesson").select("*").order("sort_order"),
    supabase.from("lesson_completion").select("*").eq("recruit_id", recruit.id),
    supabase
      .from("milestone")
      .select("*")
      .eq("recruit_id", recruit.id),
    supabase
      .from("policy_submission")
      .select("*")
      .eq("recruit_id", recruit.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("check_in")
      .select("*")
      .eq("recruit_id", recruit.id)
      .order("check_in_date", { ascending: false })
      .limit(14),
    supabase
      .from("check_in")
      .select("*")
      .eq("recruit_id", recruit.id)
      .eq("check_in_date", today)
      .maybeSingle(),
  ]);

  const lessons = (lessonsRows ?? []) as TrainingLesson[];
  const completions = (completionsRows ?? []) as LessonCompletion[];
  const milestones = (milestonesRows ?? []) as Milestone[];
  const policies = (policiesRows ?? []) as PolicySubmission[];
  const checkIns = (checkInsRows ?? []) as CheckIn[];
  const latestCheckIn = (latestCheckInRow as CheckIn | null) ?? null;

  const heading =
    recruit.phase === "licensing" ? (
      <PortalHeading
        eyebrow="License"
        title="Get Licensed In 5 Steps"
        subtitle="Follow the step by step guide to get your license."
      />
    ) : (
      <PortalHeading eyebrow="Your progress" title={phaseLabel(recruit.phase)} />
    );

  // Only the seeded demo recruit sees the reset control; a real recruit never
  // gets it. Lets us replay the licensing flow from step 1 on the live site.
  const isDemoRecruit = person.email === devAccountByRole("recruit")?.email;

  // The platform unlocks once the recruit clears the Xcel study-login step
  // (phase_step reaches studying). Drives the one-time celebration overlay —
  // computed from real progress, never a URL flag.
  const platformUnlocked =
    recruit.phase === "licensing" &&
    (recruit.phase_step === "studying" || recruit.phase_step === "exam_passed");

  return (
    <PortalShell
      heading={heading}
      flash={{
        ok: params.ok,
        error: params.error,
        milestone: params.milestone,
      }}
    >
      <UnlockCelebration recruitId={recruit.id} unlocked={platformUnlocked} />
      {isDemoRecruit ? (
        <div className="mb-6 flex flex-col items-start gap-2">
          <form action={showFullFlowForm}>
            <SubmitButton variant="ghost" pendingLabel="Loading…">
              ⏭ Show full flow
            </SubmitButton>
          </form>
          <form action={resetLicensingForm}>
            <SubmitButton variant="ghost" pendingLabel="Resetting…">
              ↺ Reset to step 1
            </SubmitButton>
          </form>
        </div>
      ) : null}
      {recruit.phase === "licensing" ? (
        <LicensingView
          recruit={recruit}
          uplineName={uplineName}
          adminEmail={adminEmail}
          videos={licensingVideos}
          licensing={licensing}
        />
      ) : recruit.phase === "onboarding" ? (
        <OnboardingView
          recruit={recruit}
          lessons={lessons.filter((l) => l.phase === "onboarding")}
          completions={completions}
          latestCheckIn={latestCheckIn}
        />
      ) : recruit.phase === "bootcamp" ? (
        <BootcampView
          recruit={recruit}
          milestones={milestones}
          policies={policies}
          checkIns={checkIns}
          latestCheckIn={latestCheckIn}
          graduationPolicyCount={installation.graduationPolicyCount}
          graduationWindowDays={installation.graduationWindowDays}
        />
      ) : recruit.phase === "graduated" ? (
        <GraduatedView recruit={recruit} />
      ) : (
        <p className="text-sm text-mute">Unknown phase.</p>
      )}
    </PortalShell>
  );
}
