import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordCheckIn } from "@/lib/actions/portal";
import PortalShell, { PortalHeading } from "../_components/portal-shell";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import type { CheckIn, Recruit } from "@/lib/db/types";
import { Card, Textarea, Button } from "@/components/ui";

const RETURN_TO = "/portal/check-in";

export default async function PortalCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/check-in");
  if (person.is_builder) redirect("/producer");
  if (person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");
  if (!portalFeaturesUnlocked(recruit)) redirect("/portal");

  const today = new Date().toISOString().slice(0, 10);
  const { data: checkInRows } = await supabase
    .from("check_in")
    .select("*")
    .eq("recruit_id", recruit.id)
    .order("check_in_date", { ascending: false })
    .limit(7);

  const checkIns = (checkInRows ?? []) as CheckIn[];
  const todays = checkIns.find((c) => c.check_in_date === today) ?? null;
  const params = await searchParams;

  return (
    <PortalShell
      heading={
        <PortalHeading
          eyebrow="Check-in"
          title="What did you do today?"
          subtitle="A quick daily note keeps your builder in the loop and your momentum visible."
        />
      }
    >
      {params.ok ? (
        <div className="mb-6 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Check-in saved.
        </div>
      ) : null}
      {params.error ? (
        <div className="mb-6 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(params.error)}
        </div>
      ) : null}

      <Card>
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
          {todays ? "Update today's check-in" : "Today's check-in"}
        </h2>
        <form action={recordCheckIn} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="returnTo" value={RETURN_TO} />
          <Textarea
            name="summary"
            rows={3}
            required
            defaultValue={todays?.summary ?? ""}
            placeholder="e.g. Two hours on the property/casualty section + 1 dial session."
          />
          <Button type="submit" variant="primary" className="self-start">
            {todays ? "Update check-in" : "Save check-in"}
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
          Recent check-ins
        </h2>
        {checkIns.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-mute">
            No check-ins yet. Your first one is above.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {checkIns.map((c) => (
              <li key={c.id} className="py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                  {c.check_in_date}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                  {c.summary}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PortalShell>
  );
}
