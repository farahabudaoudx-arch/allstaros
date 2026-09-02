import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { AppChrome } from "@/components/producer/AppChrome";
import { PageTransition } from "@/components/PageTransition";

/**
 * The producer frame: sidebar, logo, avatar, bug report, chat.
 *
 * Lives here rather than inside /producer/(app)/layout because two of the
 * things the sidebar links to — Sidekick and the Underwriting Wizard — sit at
 * their own top-level routes. Without this they rendered bare, so opening
 * either one dropped you out of the app and left no way back except the browser
 * button.
 */
export async function ProducerShell({
  children,
  nextPath,
}: {
  children: React.ReactNode;
  /** Where to return after signing in. */
  nextPath: string;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  if (!canAccessProducerApp(person)) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  return (
    <AppChrome person={menuPerson} chatHref={chatHref} unreadChat={unreadChat}>
      <PageTransition className="flex min-h-full min-w-0 flex-1 flex-col">
        {children}
      </PageTransition>
    </AppChrome>
  );
}
