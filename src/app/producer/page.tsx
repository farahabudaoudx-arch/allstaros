import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { DEV_LOGIN_ENABLED } from "@/lib/devLogin";
import { menuChrome } from "@/lib/producer/menu";
import {
  builderYtd,
  downlineIds,
  producerYtd,
} from "@/lib/producer/home-numbers";
import { money, num } from "@/lib/producer/format";
import {
  HomeNumbers,
  type NumberLine,
} from "@/components/producer/menu/HomeNumbers";

/** "1 deal" / "2 deals". The copy is written around a blank, so the noun has
 *  to agree with whatever number lands in it. */
function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export default async function ProducerHome({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  if (!canAccessProducerApp(person)) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  // DEV-ONLY (hard-gated by DEV_LOGIN_ENABLED, never reachable in production):
  // ?preview=<name> renders a real person's scoreboard, read with the service
  // role. Same escape hatch the Downline Tree has, for the same reason — you
  // can see what a populated screen looks like without impersonating anyone.
  const { preview } = await searchParams;
  const previewName = DEV_LOGIN_ENABLED && preview ? preview.trim() : "";
  const service = previewName ? createServiceRoleClient() : null;
  const subject = service
    ? (
        await service
          .from("person")
          .select("id, full_name, is_builder")
          .eq("status", "active")
          .ilike("full_name", `%${previewName}%`)
          .limit(1)
          .maybeSingle()
      ).data as { id: string; full_name: string; is_builder: boolean } | null
    : null;

  // Reading as someone else means reading past RLS, so the team has to be
  // resolved explicitly rather than left to the viewer's own policy scope.
  const subjectId = subject?.id ?? person.id;
  const isBuilder = subject ? subject.is_builder : person.is_builder;
  const fullName = subject?.full_name ?? person.full_name;
  const supabase = service ?? (await createClient());
  const downline =
    service && subject ? await downlineIds(service, subject.id) : undefined;

  const firstName = fullName?.trim()?.split(/\s+/)[0] ?? "there";

  // Dress the chrome as the previewed person too, so previewing a producer
  // shows the producer's sidebar rather than the signed-in builder's. Only the
  // shape of the nav changes; the drawer still acts on the real session.
  const chromePerson = subject
    ? { ...menuPerson, fullName: subject.full_name, isBuilder: subject.is_builder }
    : menuPerson;

  // A builder's scoreboard leads with their team; a producer's is all their
  // own activity. Both end on issued premium, the number that pays.
  let lines: NumberLine[];
  if (isBuilder) {
    const n = await builderYtd(supabase, subjectId, downline);
    lines = [
      { before: "You have issued", value: money(n.ipCents), after: "IP" },
      {
        before: "You have",
        value: num(n.recruitsInPipeline),
        after: `${plural(n.recruitsInPipeline, "recruit", "recruits")} in the pipeline`,
      },
      {
        before: "You have",
        value: num(n.writers),
        after: `${plural(n.writers, "writer", "writers")} on your team`,
      },
      { before: "Your team has submitted", value: money(n.teamApCents), after: "AP" },
      { before: "Your team has issued", value: money(n.teamIpCents), after: "IP" },
    ];
  } else {
    const n = await producerYtd(supabase, subjectId);
    lines = [
      { before: "You have made", value: num(n.dials), after: plural(n.dials, "dial", "dials") },
      {
        before: "You have ran",
        value: num(n.presentations),
        after: plural(n.presentations, "presentation", "presentations"),
      },
      { before: "You have closed", value: num(n.sales), after: plural(n.sales, "deal", "deals") },
      { before: "You have submitted", value: money(n.apCents), after: "AP" },
      { before: "You have issued", value: money(n.ipCents), after: "IP" },
    ];
  }

  return (
    <HomeNumbers
      person={chromePerson}
      greetingName={firstName}
      lines={lines}
      chatHref={chatHref}
      unreadChat={unreadChat}
      previewOf={subject?.full_name}
    />
  );
}
