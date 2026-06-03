import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LicensingView from "./_components/licensing-view";
import OnboardingView from "./_components/onboarding-view";
import BootcampView from "./_components/bootcamp-view";
import GraduatedView from "./_components/graduated-view";
import PortalShell, { PortalHeading } from "./_components/portal-shell";
import { phaseLabel } from "@/lib/pipeline/labels";
import { DEV_LOGIN_ENABLED, devAccountByRole } from "@/lib/devLogin";
import { resetDevRecruitByPersonId } from "@/lib/devReset";
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
  if (person.is_builder) redirect("/dashboard");
  if (person.is_producer) redirect("/producer");

  const params = await searchParams;

  // Dev-only: arriving at the portal from outside the flow (a fresh login or a
  // typed URL) resets the seeded recruit to a clean step 1, so the demo account
  // never carries stale progress between sessions. Loads that come from inside
  // the portal itself — i.e. the redirect after a step action — carry a referer
  // pointing back at /portal, and are left untouched so progress sticks.
  const referer = (await headers()).get("referer") ?? "";
  const cameFromPortal = referer.includes("/portal");
  if (
    DEV_LOGIN_ENABLED &&
    !cameFromPortal &&
    person.email === devAccountByRole("recruit")?.email
  ) {
    await resetDevRecruitByPersonId(person.id);
  }

  const supabase = await createClient();

  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");

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
        title="Get licensed in 5 steps"
        subtitle="Pass your state exam and submit fingerprints. Clear these and your portal unlocks Bootcamp."
      />
    ) : (
      <PortalHeading eyebrow="Your progress" title={phaseLabel(recruit.phase)} />
    );

  return (
    <PortalShell
      heading={heading}
      flash={{
        ok: params.ok,
        error: params.error,
        milestone: params.milestone,
      }}
    >
      {recruit.phase === "licensing" ? (
        <LicensingView recruit={recruit} />
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
        />
      ) : recruit.phase === "graduated" ? (
        <GraduatedView recruit={recruit} />
      ) : (
        <p className="text-sm text-mute">Unknown phase.</p>
      )}
    </PortalShell>
  );
}
