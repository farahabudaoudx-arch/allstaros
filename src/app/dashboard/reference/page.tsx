import { SectionHeading, Card } from "@/components/ui";

export default function ReferencePage() {
  return (
    <div className="max-w-3xl">
      <SectionHeading
        title="Interview reference"
      />
      <p className="mt-2 text-sm text-subtle">
        Framework and playbooks for your screening conversations.
      </p>

      <Card className="mt-6">
        <h3 className="text-xs uppercase tracking-[0.16em] text-mute">
          The framework
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-subtle marker:text-mute">
          <li>
            <strong className="text-ink">Open with their why.</strong> Why are
            they on this call — what made them pick up the phone?
          </li>
          <li>
            <strong className="text-ink">Show the model.</strong> A 28-day
            bootcamp, gated phases, daily check-ins. No surprises later.
          </li>
          <li>
            <strong className="text-ink">Test for grit.</strong> Two questions
            about the hardest thing they&#x2019;ve finished — recently — and
            what it cost them.
          </li>
          <li>
            <strong className="text-ink">License math.</strong> They get the
            cost, the timeline, the exam.
          </li>
          <li>
            <strong className="text-ink">Calendar move.</strong> If you&#x2019;d
            hire them, mark interview passed in the dashboard. They&#x2019;ll
            get an email to sign in.
          </li>
        </ol>
      </Card>

      <Card className="mt-4">
        <h3 className="text-xs uppercase tracking-[0.16em] text-mute">
          Playbooks
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-subtle">
          <li>
            <strong className="text-ink">Stalled at exam_scheduled:</strong> ask
            if they need a study partner, propose a specific time block.
          </li>
          <li>
            <strong className="text-ink">Failed exam:</strong> 24 hours of
            grace, then a re-study plan and a new exam_date.
          </li>
          <li>
            <strong className="text-ink">Bootcamp day 14 and 3 policies:</strong>{" "}
            live-call ride-along, increase dial volume by 50% for one week.
          </li>
          <li>
            <strong className="text-ink">Bootcamp gate missed at day 28:</strong>{" "}
            stop, talk before deciding removal.
          </li>
        </ul>
      </Card>

      <Card className="mt-4">
        <h3 className="text-xs uppercase tracking-[0.16em] text-mute">
          A few rules
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-subtle">
          <li>You can see your downline only. Up and sideways stay private.</li>
          <li>
            Phase advances are guarded. The dashboard will block invalid moves.
          </li>
          <li>The system flags. You remove. Never collapse the two.</li>
        </ul>
      </Card>
    </div>
  );
}
