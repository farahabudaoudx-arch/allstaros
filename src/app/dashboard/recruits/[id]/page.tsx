import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phaseLabel, phaseStepLabel } from "@/lib/pipeline/labels";
import {
  BOOTCAMP_POLICY_GATE,
  BOOTCAMP_WINDOW_DAYS,
  type CheckIn,
  type LessonCompletion,
  type Message,
  type Milestone,
  type Person,
  type PolicySubmission,
  type Recruit,
  type TrainingLesson,
} from "@/lib/db/types";
import { Card, Badge } from "@/components/ui";
import BuilderActions from "./_components/builder-actions";
import RemoveForm from "./_components/remove-form";

type RecruitWithPerson = Recruit & {
  person: Pick<Person, "full_name" | "email" | "status">;
};

export default async function RecruitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .eq("id", id)
    .maybeSingle();

  const recruit = recruitRow as unknown as RecruitWithPerson | null;
  if (!recruit) notFound();

  const [
    { data: checkInsRows },
    { data: milestonesRows },
    { data: policiesRows },
    { data: lessonsRows },
    { data: completionsRows },
    { data: messagesRows },
  ] = await Promise.all([
    supabase
      .from("check_in")
      .select("*")
      .eq("recruit_id", recruit.id)
      .order("check_in_date", { ascending: false })
      .limit(30),
    supabase.from("milestone").select("*").eq("recruit_id", recruit.id),
    supabase
      .from("policy_submission")
      .select("*")
      .eq("recruit_id", recruit.id)
      .order("submitted_at", { ascending: false }),
    supabase.from("training_lesson").select("*"),
    supabase
      .from("lesson_completion")
      .select("*")
      .eq("recruit_id", recruit.id),
    supabase
      .from("message")
      .select("*")
      .eq("recruit_id", recruit.id)
      .eq("channel", "builder")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const checkIns = (checkInsRows ?? []) as CheckIn[];
  const milestones = (milestonesRows ?? []) as Milestone[];
  const policies = (policiesRows ?? []) as PolicySubmission[];
  const lessons = (lessonsRows ?? []) as TrainingLesson[];
  const completions = (completionsRows ?? []) as LessonCompletion[];
  const messages = (messagesRows ?? []) as Message[];

  const lessonsByPhase = {
    licensing: lessons.filter((l) => l.phase === "licensing"),
    onboarding: lessons.filter((l) => l.phase === "onboarding"),
  };
  const completedIds = new Set(completions.map((c) => c.lesson_id));

  const lastCheckIn = checkIns[0];
  const today = new Date().toISOString().slice(0, 10);
  const lapse = lastCheckIn
    ? Math.floor(
        (new Date(today).getTime() -
          new Date(lastCheckIn.check_in_date).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  const params2 = await searchParams;

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Back to roster
      </Link>
      <div className="mt-4 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            {recruit.person.full_name}
          </h1>
          <p className="mt-1 text-sm text-mute">{recruit.person.email}</p>
        </div>
        {recruit.flagged ? (
          <Badge tone="warn">
            Flagged: {recruit.flag_reason ?? "stalled"}
          </Badge>
        ) : null}
      </div>

      {params2.error ? (
        <div className="mt-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(params2.error)}
        </div>
      ) : null}
      {params2.ok ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Updated.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Phase" value={phaseLabel(recruit.phase)} />
        <Stat label="Step" value={phaseStepLabel(recruit.phase_step)} />
        <Stat label="Exam date" value={recruit.exam_date ?? "Not set"} />
        <Stat
          label="Bootcamp started"
          value={recruit.bootcamp_started_at ?? "Not started"}
        />
        {recruit.exam_failures > 0 ? (
          <Stat label="Exam attempts failed" value={String(recruit.exam_failures)} />
        ) : null}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Builder actions
        </h2>
        <p className="mt-1 text-sm text-subtle">
          Phase advances are guarded by the state machine — gates are enforced
          in Postgres.
        </p>
        <div className="mt-4">
          <BuilderActions
            recruit={recruit}
            onboardingAssignmentsTotal={
              lessonsByPhase.onboarding.filter((l) => l.is_assignment).length
            }
            onboardingAssignmentsDone={
              lessonsByPhase.onboarding.filter(
                (l) => l.is_assignment && completedIds.has(l.id),
              ).length
            }
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Training progress
        </h2>
        <p className="mt-1 text-sm text-subtle">
          Lessons grouped by phase. Assignments unlock phase advancement.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["licensing", "onboarding"] as const).map((phase) => {
            const phaseLessons = lessonsByPhase[phase];
            const done = phaseLessons.filter((l) =>
              completedIds.has(l.id),
            ).length;
            return (
              <Card key={phase}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium capitalize text-ink">
                    {phase}
                  </div>
                  <div className="font-mono text-xs text-mute">
                    {done} / {phaseLessons.length}
                  </div>
                </div>
                {phaseLessons.length === 0 ? (
                  <p className="mt-3 text-xs text-mute">No lessons yet.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {phaseLessons.map((l) => {
                      const isDone = completedIds.has(l.id);
                      return (
                        <li
                          key={l.id}
                          className="flex items-center justify-between gap-3 text-subtle"
                        >
                          <span
                            className={isDone ? "text-mute line-through" : ""}
                          >
                            {l.title}
                            {l.is_assignment ? (
                              <span className="ml-2 text-xs text-mute">
                                (assignment)
                              </span>
                            ) : null}
                          </span>
                          {isDone ? <Badge tone="pos">done</Badge> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Check-in history
        </h2>
        <p className="mt-1 text-sm text-subtle">
          {lapse === null
            ? "No check-ins yet."
            : `Last check-in: ${lastCheckIn.check_in_date} (${lapse}d ago).`}
        </p>
        {checkIns.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-mute">
            Nothing yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {checkIns.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">
                    {c.check_in_date}
                  </span>
                  {c.pacing || c.actuals ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                      Pacing/actuals recorded
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-subtle">{c.summary}</p>
                {c.pacing || c.actuals ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-card-hi p-2 text-xs text-subtle">
                    {JSON.stringify(
                      { pacing: c.pacing, actuals: c.actuals },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recruit.phase === "bootcamp" || recruit.phase === "graduated" ? (
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              Bootcamp progress
            </h2>
            <p className="mt-1 text-sm text-subtle">
              {policies.length} / {BOOTCAMP_POLICY_GATE} submitted in the{" "}
              {BOOTCAMP_WINDOW_DAYS}-day window.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-subtle marker:text-mute">
              {policies.slice(0, 8).map((p) => (
                <li key={p.id}>
                  {p.submitted_at}
                  {p.note ? ` — ${p.note}` : ""}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              Milestones
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-subtle">
              {milestones.length === 0 ? (
                <li className="text-mute">None yet.</li>
              ) : (
                milestones.map((m) => (
                  <li key={m.id}>
                    {m.kind} — {new Date(m.reached_at).toLocaleDateString()}
                  </li>
                ))
              )}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Removal</h2>
        <p className="mt-1 text-sm text-subtle">
          Available only when the system has flagged a stall.
        </p>
        <div className="mt-4">
          <RemoveForm recruit={recruit} />
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            Recent messages
          </h2>
          <Link
            href={`/dashboard/recruits/${recruit.id}/messages`}
            className="text-sm font-medium text-accent hover:text-accent-soft"
          >
            Open thread →
          </Link>
        </div>
        {messages.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-mute">
            No messages yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {messages.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-hairline bg-card px-3.5 py-2.5"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  {m.is_ai ? "AI" : "Member"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </span>
                <p className="mt-1 text-subtle">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
