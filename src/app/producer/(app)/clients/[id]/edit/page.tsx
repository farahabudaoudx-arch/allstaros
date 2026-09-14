import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { ClientForm } from "@/components/producer/clients/ClientForm";
import type { Client } from "@/lib/clients/types";
import { getInstallationConfig } from "@/lib/installation/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const installation = await getInstallationConfig();
  return { title: `Edit Client · ${installation.productName}` };
}

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=/producer/clients/${id}/edit`);

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
      <ClientForm clientId={id} initialClient={data as Client} />
    </main>
  );
}
