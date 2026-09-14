import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { MenuScreen, type MenuTile } from "@/components/producer/menu/MenuScreen";
import { getInstallationBrand } from "@/lib/installation/config";

const TILES: MenuTile[] = [
  { label: "Activity", hint: "Your production", icon: "/menu-icons/my-numbers/analytics.png", href: "/producer/analytics" },
  { label: "Lead Spend Tracker", hint: "What you're spending on leads", icon: "/menu-icons/my-numbers/lead-spend-tracker.png", href: "/producer/lead-spend" },
  { label: "Issued Premium Reports", hint: "What's been issued", icon: "/menu-icons/my-numbers/issued-premium-reports.png", href: "/producer/issued-premium" },
];

export default async function MyNumbersMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/my-numbers");
  if (!canAccessProducerApp(person)) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);
  const brand = await getInstallationBrand();

  return (
    <MenuScreen
      person={menuPerson}
      title="My Numbers"
      backHref={person.is_builder ? "/producer/menu/personal" : "/producer"}
      tiles={TILES}
      chatHref={chatHref}
      unreadChat={unreadChat}
      brand={brand}
    />
  );
}
