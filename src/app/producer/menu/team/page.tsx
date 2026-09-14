import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { MenuScreen, type MenuTile } from "@/components/producer/menu/MenuScreen";
import { getInstallationBrand } from "@/lib/installation/config";

const TILES: MenuTile[] = [
  { label: "Add Team Member", hint: "Invite by email", icon: "/menu-icons/team/add-team-member.png", addPeople: { title: "Add Team Member", role: "producer" } },
  { label: "My Downline", hint: "Your org chart", icon: "/menu-icons/team/my-downline.png", href: "/producer/downline" },
  { label: "Team Performance", hint: "Roster and analytics", icon: "/menu-icons/team/team-performance.png", href: "/producer/team" },
  { label: "Team Debt", hint: "Coming soon", icon: "/menu-icons/team/team-debt.png", locked: true },
];

export default async function TeamMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/team");
  if (!person.is_builder) redirect("/producer");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);
  const brand = await getInstallationBrand();

  return (
    <MenuScreen
      person={menuPerson}
      title="Team"
      backHref="/producer"
      tiles={TILES}
      chatHref={chatHref}
      unreadChat={unreadChat}
      brand={brand}
      columns={2}
    />
  );
}
