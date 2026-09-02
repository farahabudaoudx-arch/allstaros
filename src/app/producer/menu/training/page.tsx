import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { menuChrome } from "@/lib/producer/menu";
import { MenuScreen, type MenuTile } from "@/components/producer/menu/MenuScreen";

const TILES: MenuTile[] = [
  { label: "Training Calendar", hint: "This week's live calls", icon: "/menu-icons/training/training-calendar.png", href: "/producer/trainings/upcoming" },
  { label: "Previous Trainings", hint: "Catch up on past calls", icon: "/menu-icons/training/previous-trainings.png", href: "/producer/trainings/live" },
  { label: "Bootcamp", hint: "Coming soon", icon: "/menu-icons/training/bootcamp.png", locked: true },
];

export default async function TrainingMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/training");
  if (!canAccessProducerApp(person)) redirect("/portal");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  return (
    <MenuScreen
      person={menuPerson}
      title="Training"
      backHref={person.is_builder ? "/producer/menu/personal" : "/producer"}
      tiles={TILES}
      chatHref={chatHref}
      unreadChat={unreadChat}
    />
  );
}
