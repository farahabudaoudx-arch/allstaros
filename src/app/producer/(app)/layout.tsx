import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { AppChrome } from "@/components/producer/AppChrome";
import { PageTransition } from "@/components/PageTransition";

/**
 * Chrome for every real producer page reached from a menu tile. Same frame the
 * menu screens use (logo, avatar, bug report, chat), so those four controls
 * stay put when you open a page instead of vanishing until you go back.
 *
 * In-page nav is still the Back/Home pair under each page title (PageHeader),
 * not a sidebar.
 */
export default async function ProducerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  if (!person.is_producer && !person.is_builder) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  return (
    <AppChrome person={menuPerson} chatHref={chatHref} unreadChat={unreadChat}>
      <PageTransition className="flex min-h-full min-w-0 flex-1 flex-col">
        {children}
      </PageTransition>
    </AppChrome>
  );
}
