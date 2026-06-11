import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { PageTransition } from "@/components/PageTransition";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import type { Recruit } from "@/lib/db/types";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal");
  if (person.is_builder) redirect("/producer");
  if (person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("phase, phase_step")
    .eq("person_id", person.id)
    .maybeSingle();
  if (!recruitRow) redirect("/onboarding/pending");

  const locked = !portalFeaturesUnlocked(recruitRow as Recruit);

  const nav: NavItem[] = [
    { label: "License", href: "/portal" },
    { label: "Training", href: "/portal/training", locked },
    { label: "Check-in", href: "/portal/check-in", locked },
    { label: "All Star Sidekick", href: "/portal/help", locked },
    { label: "Messages", href: "/portal/messages" },
  ];

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar items={nav} tag="Recruit" userName={person.full_name} />
      <PageTransition className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        {children}
      </PageTransition>
    </div>
  );
}
