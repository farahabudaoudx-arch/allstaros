import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClass } from "@/components/ui";
import { markExamPassedForm } from "@/lib/actions/portal";
import { SubmitButton } from "../_components/submit-button";
import type { Recruit } from "@/lib/db/types";

function BackToPortal() {
  return (
    <Link href="/portal" className={buttonClass("secondary")}>
      ‹ Back To Portal
    </Link>
  );
}

export default async function FingerprintsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/fingerprints");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/portal");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <BackToPortal />

      <div className="mt-8 space-y-6">
        <header className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Fingerprints
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] md:text-4xl">
            Submit your fingerprints
          </h1>
        </header>

        {/* Placeholder — real fingerprint instructions go here. */}
        <div className="rounded-xl border border-dashed border-hairline px-5 py-6 text-sm leading-relaxed text-subtle">
          <p className="font-semibold text-ink">[Placeholder content]</p>
          <p className="mt-2">
            Everything about your fingerprints will live here — whether your
            state requires them, where to go, what to bring, what it costs, and
            how long it takes. We&apos;ll fill this in with the real details.
          </p>
        </div>

        <form action={markExamPassedForm}>
          <input type="hidden" name="recruitId" value={recruit.id} />
          <SubmitButton variant="primary" pendingLabel="Saving…">
            I&apos;ve submitted my fingerprints — continue →
          </SubmitButton>
        </form>
      </div>

      <div className="mt-10 border-t border-hairline pt-6">
        <BackToPortal />
      </div>
    </main>
  );
}
