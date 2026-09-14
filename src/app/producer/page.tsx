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
import { loadGatewayConnectionState } from "@/lib/gateway/connection";
import { gatewayConnectionNotice } from "@/lib/gateway/connection-types";
import { getInstallationConfig } from "@/lib/installation/config";

/** "1 deal" / "2 deals". The copy is written around a blank, so the noun has
 *  to agree with whatever number lands in it. */

function gatewayMoney(value: number | null): string {
  return value == null ? "Unknown" : money(value);
}

function gatewayCount(value: number | null): string {
  return value == null ? "Unknown" : num(value);
}

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
  const installation = await getInstallationConfig();
  const brand = {
    organizationName: installation.organizationName,
    shortName: installation.shortName,
    productName: installation.productName,
    brandPrimaryColor: installation.brandPrimaryColor,
    brandAccentColor: installation.brandAccentColor,
    logoUrl: installation.logoUrl,
    faviconUrl: installation.faviconUrl,
  };

  // Development-only visual QA. ?preview=<name> renders a member's scoreboard
  // through the service role without changing the signed-in identity.
  // DEV_LOGIN_ENABLED is production-disabled and keeps this path unreachable
  // outside the approved development environment.
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
  const [downline, gatewayConnection] = await Promise.all([
    service && subject ? downlineIds(service, subject.id) : Promise.resolve(undefined),
    subject ? loadGatewayConnectionState(subject.id) : Promise.resolve(menuPerson.gatewayConnection),
  ]);

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
    const n = await builderYtd(
      supabase,
      subjectId,
      downline,
      gatewayConnection.connected,
      installation.timezone,
    );
    lines = [
      { before: "You have issued", value: gatewayMoney(n.ipCents), after: "IP" },
      {
        before: "You have",
        value: num(n.recruitsInPipeline),
        after: `${plural(n.recruitsInPipeline, "recruit", "recruits")} in the pipeline`,
      },
      {
        before: "You have",
        value: gatewayCount(n.writers),
        after:
          n.writers == null
            ? "writers on your team"
            : `${plural(n.writers, "writer", "writers")} on your team`,
      },
      { before: "Your team has submitted", value: money(n.teamApCents), after: "AP" },
      { before: "Your team has issued", value: gatewayMoney(n.teamIpCents), after: "IP" },
    ];
  } else {
    const n = await producerYtd(
      supabase,
      subjectId,
      gatewayConnection.connected,
      installation.timezone,
    );
    lines = [
      {
        before: "You have made",
        value: num(n.dials),
        after: plural(n.dials, "dial", "dials"),
      },
      {
        before: "You have ran",
        value: num(n.presentations),
        after: plural(n.presentations, "presentation", "presentations"),
      },
      {
        before: "You have closed",
        value: num(n.sales),
        after: plural(n.sales, "deal", "deals"),
      },
      { before: "You have submitted", value: money(n.apCents), after: "AP" },
      { before: "You have issued", value: gatewayMoney(n.ipCents), after: "IP" },
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
      gatewayNotice={gatewayConnectionNotice(gatewayConnection)}
      brand={brand}
    />
  );
}
