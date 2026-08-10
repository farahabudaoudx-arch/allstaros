import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createMonthlyProducerPreview } from "@/lib/scorecards/lifecycle";
import {
  loadCurrentMonthlyProducerOverview,
  loadCurrentMonthlyProducerSource,
} from "@/lib/scorecards/source";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/scorecards");

  const service = createServiceRoleClient();
  const source = await loadCurrentMonthlyProducerSource(service, person.id);
  const preview = createMonthlyProducerPreview(source);
  const overview = await loadCurrentMonthlyProducerOverview(
    service,
    person,
    preview.totalIssuedIpCents,
  );
  return <ScorecardsPageShell preview={preview} overview={overview} />;
}
