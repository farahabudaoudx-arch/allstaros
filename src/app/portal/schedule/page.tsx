import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClass } from "@/components/ui";
import { examSiteForState } from "@/lib/exam-sites";
import { US_STATES } from "@/lib/us-states";
import type { Recruit } from "@/lib/db/types";

// Walkthrough video shown at the top of the scheduling page. Swap for the real
// one when it's ready.
const SCHEDULE_VIDEO = "https://www.youtube.com/embed/dQw4w9WgXcQ";

function BackToPortal() {
  return (
    <Link href="/portal" className={buttonClass("secondary")}>
      ‹ Back To Portal
    </Link>
  );
}

function stateName(code: string | null): string | null {
  if (!code) return null;
  return US_STATES.find((s) => s.code === code.toUpperCase())?.name ?? code;
}

export default async function SchedulePage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/schedule");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/portal");

  const name = stateName(recruit.state);
  const site = examSiteForState(recruit.state);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <BackToPortal />

      <div className="mt-8 space-y-6">
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-hairline bg-black">
          <iframe
            src={SCHEDULE_VIDEO}
            title="How to schedule your state exam"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>

        <header className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Schedule your exam
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] md:text-4xl">
            Find your testing center
          </h1>
        </header>

        {site ? (
          <>
            <p className="text-base leading-relaxed text-subtle">
              Based on your onboarding, you&apos;re getting licensed in{" "}
              <span className="font-semibold text-ink">{name}</span>.{" "}
              {name} administers its insurance licensing exam through{" "}
              <span className="font-semibold text-ink">{site.vendor}</span>. Watch
              the video above, then click below to schedule at your testing center.
            </p>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary")}
            >
              Schedule with {site.vendor} →
            </a>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-hairline px-4 py-5 text-sm text-mute">
            We couldn&apos;t match a testing center to your state
            {name ? ` (${name})` : ""}. Reach out to your builder and they&apos;ll
            point you to the right place to schedule.
          </p>
        )}
      </div>

      <div className="mt-10 border-t border-hairline pt-6">
        <BackToPortal />
      </div>
    </main>
  );
}
