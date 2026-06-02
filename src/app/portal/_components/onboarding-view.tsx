import { completeLesson, recordCheckIn } from "@/lib/actions/portal";
import type {
  CheckIn,
  LessonCompletion,
  Recruit,
  TrainingLesson,
} from "@/lib/db/types";
import Card from "./card";
import { Textarea, Button, Badge } from "@/components/ui";

export default function OnboardingView({
  recruit,
  lessons,
  completions,
  latestCheckIn,
}: {
  recruit: Recruit;
  lessons: TrainingLesson[];
  completions: LessonCompletion[];
  latestCheckIn: CheckIn | null;
}) {
  const completedIds = new Set(completions.map((c) => c.lesson_id));
  const today = new Date().toISOString().slice(0, 10);
  const alreadyCheckedInToday = latestCheckIn?.check_in_date === today;
  const step = recruit.phase_step ?? "training";

  return (
    <div className="space-y-6">
      <Card
        title="Training"
        subtitle="Work through these lessons. Your builder advances you to roleplay when assignments are complete."
      >
        {lessons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-mute">
            No onboarding lessons yet — your upline will add them.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {lessons.map((lesson) => {
              const done = completedIds.has(lesson.id);
              return (
                <li
                  key={lesson.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm text-ink">{lesson.title}</p>
                    {lesson.is_assignment ? (
                      <p className="text-xs text-mute">Assignment</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {lesson.video_url ? (
                      <a
                        href={lesson.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-accent-soft"
                      >
                        Watch →
                      </a>
                    ) : null}
                    {done ? (
                      <Badge tone="pos">Done</Badge>
                    ) : (
                      <form action={completeLesson}>
                        <input
                          type="hidden"
                          name="lessonId"
                          value={lesson.id}
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-subtle transition hover:border-accent hover:text-accent"
                        >
                          Mark complete
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Book your roleplay"
        subtitle="When training is done, book time with your builder for a roleplay. They’ll mark it pass/fail and move you to contracting."
      >
        <Pill step={step} />
      </Card>

      <Card
        title="Contracting"
        subtitle="Your builder walks you through the carrier checklist. Once complete, you’re moved to bootcamp."
      >
        <Pill step={step} target="contracting" />
      </Card>

      <Card
        title="Today’s check-in"
        subtitle={
          alreadyCheckedInToday
            ? "You’ve already checked in today. Update if you need."
            : "What did you do today?"
        }
      >
        <form action={recordCheckIn} className="flex flex-col gap-3">
          <Textarea
            name="summary"
            rows={3}
            required
            defaultValue={
              alreadyCheckedInToday ? (latestCheckIn?.summary ?? "") : ""
            }
          />
          <Button type="submit" variant="primary" className="self-start">
            {alreadyCheckedInToday ? "Update check-in" : "Save check-in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Pill({ step, target }: { step: string; target?: string }) {
  const reached = target ? step === target : step !== "training";
  return (
    <Badge tone={reached ? "pos" : "default"}>
      {reached ? "Active" : "Waiting on builder"}
    </Badge>
  );
}
