import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { MenuScreen, type MenuTile } from "@/components/producer/menu/MenuScreen";
import { getInstallationBrand } from "@/lib/installation/config";

export default async function ResourcesMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/resources");
  if (!canAccessProducerApp(person)) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);
  const brand = await getInstallationBrand();
  const tiles: MenuTile[] = [
    { label: `${brand.shortName} Sidekick`, hint: "AI assistant", icon: "/menu-icons/resources/sidekick.png", href: "/allstar-ai" },
    { label: "Underwriting Wizard", hint: "Match clients to a carrier", icon: "/menu-icons/resources/underwriting-wizard.png", href: "/underwriting" },
    { label: "Scripts", hint: "Proven phone scripts", icon: "/menu-icons/resources/scripts.png", href: "/producer/resources/scripts" },
    { label: "Carrier Links", hint: "Carrier portal logins", icon: "/menu-icons/resources/carrier-links.png", href: "/producer/resources/portal-links" },
    { label: "Carrier Contacts", hint: "Rep phone and email", icon: "/menu-icons/resources/carrier-contacts.png", href: "/producer/resources/carrier-contacts" },
    { label: "App Guides", hint: "E-app walkthroughs by carrier", icon: "/menu-icons/resources/app-guides.png", href: "https://mytrustedadvisor.wixsite.com/eappguides", external: true },
    ...(brand.shortName === "All Star" ? [{ label: "Merch", hint: "Shop All Star clothing", icon: "/menu-icons/producer/merch.png", href: "https://all-star.clothing/", external: true } satisfies MenuTile] : []),
  ];

  return (
    <MenuScreen
      person={menuPerson}
      title="Resources & Tools"
      backHref={person.is_builder ? "/producer/menu/personal" : "/producer"}
      tiles={tiles}
      chatHref={chatHref}
      unreadChat={unreadChat}
      brand={brand}
    />
  );
}
