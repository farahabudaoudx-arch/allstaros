import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { menuChrome, PRODUCER_MENU_TILES, type MenuTile } from "@/lib/producer/menu";
import { MenuScreen } from "@/components/producer/menu/MenuScreen";

export default async function ProducerHome() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  if (!person.is_producer && !person.is_builder) redirect("/portal");

  const firstName = person.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  const tiles: MenuTile[] = person.is_builder
    ? [
        { label: "Personal", hint: "Your own numbers", icon: "/menu-icons/builder/personal.png", href: "/producer/menu/personal" },
        { label: "Team", hint: "Downline and performance", icon: "/menu-icons/builder/team.png", href: "/producer/menu/team" },
        { label: "Recruits", hint: "Add and track recruits", icon: "/menu-icons/builder/recruits.png", href: "/producer/menu/recruits" },
      ]
    : PRODUCER_MENU_TILES;

  return (
    <MenuScreen
      person={menuPerson}
      greetingName={firstName}
      tiles={tiles}
      chatHref={chatHref}
      unreadChat={unreadChat}
    />
  );
}
