import {
  addPolicySubmission,
  markMilestone,
  recordCheckIn,
} from "@/lib/actions/portal";
import {
  BOOTCAMP_POLICY_GATE,
  BOOTCAMP_WINDOW_DAYS,
  MILESTONE_KINDS,
  type CheckIn,
  type Milestone,
  type MilestoneKind,
  type PolicySubmission,
  type Recruit,
} from "@/lib/db/types";
import Card from "./card";
import { Input, Textarea, Button } from "@/components/ui";

const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  first_dial: "First dial",
  first_presentation: "First presentation",
  first_policy: "First policy",
  first_deposit: "First deposit",
};

export default function BootcampView({
  recruit,
  milestones,
  policies,
  checkIns,
  latestCheckIn,
}: {
  recruit: Recruit;
  milestones: Milestone[];
  policies: PolicySubmission[];
  checkIns: CheckIn[];
  latestCheckIn: CheckIn | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const startedAt = recruit.bootcamp_started_at ?? today;
  const startDate = new Date(startedAt);
  const todayDate = new Date(today);
  const dayNumber = Math.max(
    1,
    Math.min(
      BOOTCAMP_WINDOW_DAYS,
      Math.floor(
        (todayDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    ),
  );
  const daysRemaining = Math.max(0, BOOTCAMP_WINDOW_DAYS - dayNumber + 1);

  const submissionsInWindow = policies.filter(
    (p) =>
      p.submitted_at >= startedAt &&
      new Date(p.submitted_at).getTime() <
        startDate.getTime() + BOOTCAMP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).length;

  const milestoneSet = new Set(milestones.map((m) => m.kind));
  const alreadyCheckedInToday = latestCheckIn?.check_in_date === today;

  return (
    <div className="space-y-6">
      <Card
        title={`Day ${dayNumber} of ${BOOTCAMP_WINDOW_DAYS}`}
        subtitle={`${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining. ${BOOTCAMP_POLICY_GATE} submitted policies graduates you.`}
      >
        <div className="space-y-3">
          <div className="h-3 w-full overflow-hidden rounded-full bg-card-hi">
            <div
              className="h-full bg-pos transition-all"
              style={{
                width: `${Math.min(100, (submissionsInWindow / BOOTCAMP_POLICY_GATE) * 100)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-subtle">Policies submitted</span>
            <span className="font-semibold tabular-nums text-ink">
              {submissionsInWindow} / {BOOTCAMP_POLICY_GATE}
            </span>
          </div>
        </div>
      </Card>

      <Card
        title="Milestones"
        subtitle="Celebration moments. Tap when they happen."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MILESTONE_KINDS.map((kind) => {
            const reached = milestoneSet.has(kind);
            return (
              <form key={kind} action={markMilestone}>
                <input type="hidden" name="kind" value={kind} />
                <button
                  type="submit"
                  disabled={reached}
                  className={
                    reached
                      ? "w-full rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-3 text-sm font-medium text-accent"
                      : "w-full rounded-xl border border-hairline bg-card px-3 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  }
                >
                  {reached ? "✓ " : ""}
                  {MILESTONE_LABELS[kind]}
                </button>
              </form>
            );
          })}
        </div>
      </Card>

      <Card
        title="Log a submitted policy"
        subtitle="Submitted counts, not issued. The 8-in-28 gate runs off this list."
      >
        <form
          action={addPolicySubmission}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label
              htmlFor="submittedAt"
              className="block text-[10px] uppercase tracking-[0.16em] text-mute"
            >
              Submitted on
            </label>
            <Input
              id="submittedAt"
              name="submittedAt"
              type="date"
              defaultValue={today}
              required
              className="mt-1.5"
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="note"
              className="block text-[10px] uppercase tracking-[0.16em] text-mute"
            >
              Note (optional)
            </label>
            <Input
              id="note"
              name="note"
              type="text"
              placeholder="Carrier, client name…"
              className="mt-1.5"
            />
          </div>
          <Button type="submit" variant="primary">
            Log
          </Button>
        </form>
        {policies.length > 0 ? (
          <ul className="mt-4 divide-y divide-hairline text-sm">
            {policies.slice(0, 5).map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span className="text-subtle">{p.submitted_at}</span>
                <span className="text-mute">{p.note ?? ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card
        title="Check-in / check-out"
        subtitle="Plan the day at the start, log what actually happened at the end. One per day."
      >
        <form action={recordCheckIn} className="grid gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-mute">
              Today’s summary
            </label>
            <Textarea
              name="summary"
              rows={2}
              required
              defaultValue={
                alreadyCheckedInToday ? (latestCheckIn?.summary ?? "") : ""
              }
              className="mt-1.5"
            />
          </div>

          <PacingFields
            label="Planned (check-in)"
            prefix="pacing_"
            defaults={
              (latestCheckIn?.pacing ?? null) as Record<string, number> | null
            }
          />
          <PacingFields
            label="Actuals (check-out)"
            prefix="actual_"
            defaults={
              (latestCheckIn?.actuals ?? null) as Record<string, number> | null
            }
          />

          <Button type="submit" variant="primary" className="self-start">
            {alreadyCheckedInToday ? "Update day" : "Save day"}
          </Button>
        </form>
        {checkIns.length > 1 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-mute">
              Recent check-ins
            </summary>
            <ul className="mt-2 divide-y divide-hairline text-sm">
              {checkIns.slice(0, 7).map((c) => (
                <li key={c.id} className="py-2">
                  <div className="text-mute">{c.check_in_date}</div>
                  <div className="text-subtle">{c.summary}</div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
    </div>
  );
}

function PacingFields({
  label,
  prefix,
  defaults,
}: {
  label: string;
  prefix: string;
  defaults: Record<string, number> | null;
}) {
  const fields: Array<[string, string]> = [
    ["dials", "Dials"],
    ["appts", "Appts"],
    ["presentations", "Presentations"],
    ["closes", "Closes"],
  ];
  return (
    <fieldset className="rounded-xl border border-hairline p-3">
      <legend className="px-2 text-[10px] uppercase tracking-[0.16em] text-mute">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fields.map(([key, lbl]) => (
          <label key={key} className="text-xs text-subtle">
            {lbl}
            <input
              name={`${prefix}${key}`}
              type="number"
              min={0}
              defaultValue={defaults?.[key] ?? 0}
              className="mt-1 w-full rounded-lg border border-hairline bg-card-hi px-2 py-1 text-sm text-ink outline-none transition focus:border-accent"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
