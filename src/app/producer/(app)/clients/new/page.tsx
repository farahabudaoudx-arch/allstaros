import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { ClientForm } from "@/components/producer/clients/ClientForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Client · All Star OS" };

export default async function NewClientPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/clients/new");
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <ClientForm />
    </main>
  );
}
