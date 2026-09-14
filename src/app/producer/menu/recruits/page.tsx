import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { MenuScreen, type MenuTile } from "@/components/producer/menu/MenuScreen";
import { getInstallationBrand } from "@/lib/installation/config";

const TILES: MenuTile[] = [
  { label: "Add Recruit", hint: "Invite by email", icon: "/menu-icons/recruits/add-recruit.png", addPeople: { title: "Add Recruit", role: "recruit" } },
  { label: "Recruiting Pipeline", hint: "Where each recruit stands", icon: "/menu-icons/recruits/recruiting-pipeline.png", href: "/producer/recruiting" },
];

export default async function RecruitsMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/recruits");
  if (!person.is_builder) redirect("/producer");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);
  const brand = await getInstallationBrand();

  return (
    <MenuScreen
      person={menuPerson}
      title="Recruits"
      backHref="/producer"
      tiles={TILES}
      chatHref={chatHref}
      unreadChat={unreadChat}
      brand={brand}
      columns={2}
    />
  );
}
