import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { ClientPage } from "@/components/producer/clients/ClientPage";
import type { Client } from "@/lib/clients/types";
import { getInstallationConfig } from "@/lib/installation/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const installation = await getInstallationConfig();
  return { title: `Client · ${installation.productName}` };
}

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=/producer/clients/${id}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("person_id", person.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <ClientPage
        clientId={id}
        initialClient={data as Client}
        agent={{
          // Prefer the Policy Info contact override; fall back to the account.
          name: person.policy_contact_name || person.full_name || person.email,
          email: person.policy_contact_email || person.email,
          phone: person.policy_contact_phone || person.phone || undefined,
        }}
      />
    </main>
  );
}
