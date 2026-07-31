import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { menuChrome, PRODUCER_MENU_TILES } from "@/lib/producer/menu";
import { MenuScreen } from "@/components/producer/menu/MenuScreen";

/** A builder's own producer-style menu — the same 6 tiles a pure producer
 *  sees at the root, reached one level down via the "Personal" tile. */
export default async function PersonalMenuPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/menu/personal");
  if (!person.is_builder) redirect("/producer");

  const { menuPerson, chatHref, unreadChat } = await menuChrome(person);

  return (
    <MenuScreen
      person={menuPerson}
      title="Personal"
      backHref="/producer"
      tiles={PRODUCER_MENU_TILES}
      chatHref={chatHref}
      unreadChat={unreadChat}
    />
  );
}
