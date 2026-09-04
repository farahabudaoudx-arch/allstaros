import { approvedPhotoUrl } from "@/lib/headshots/photo";
import { getProducerUnread } from "@/lib/producer/unread";
import type { Person } from "@/lib/db/types";
import type { InviteRole } from "@/lib/invite/batch";
import type { MenuPerson } from "@/components/producer/menu/MenuSettingsDrawer";

import { loadGatewayConnectionState } from "@/lib/gateway/connection";
export type MenuTile = {
  label: string;
  hint?: string;
  icon: string;
  href?: string;
  external?: boolean;
  /** Not wired up yet — shown dimmed with a lock badge, not clickable. */
  locked?: boolean;
  dot?: boolean;
  /** Opens the invite popup right on the menu instead of navigating. `role` is
   *  what each new row starts on; the builder can still change it per row. */
  addPeople?: { title: string; role?: InviteRole };
};

/** The producer's 6-tile menu — shown directly to non-builders at /producer,
 *  and to builders under "Personal" at /producer/menu/personal. */
export const PRODUCER_MENU_TILES: MenuTile[] = [
  { label: "Daily Tracker", hint: "Log today's activity", icon: "/menu-icons/producer/daily-tracker.png", href: "/producer/tracker" },
  { label: "Leaderboard", hint: "Where you rank", icon: "/menu-icons/producer/leaderboard.png", href: "/producer/leaderboard" },
  { label: "My Numbers", hint: "Your production", icon: "/menu-icons/producer/my-numbers.png", href: "/producer/menu/my-numbers" },
  { label: "Training", hint: "Live calls and courses", icon: "/menu-icons/producer/training.png", href: "/producer/menu/training" },
  { label: "Resources & Tools", hint: "Scripts and carriers", icon: "/menu-icons/producer/resources-tools.png", href: "/producer/menu/resources" },
  { label: "Clients", hint: "Policies and contacts", icon: "/menu-icons/producer/clients.png", href: "/producer/clients" },
];

/** Shared shaping for every /producer/menu/* screen: the drawer's person
 *  summary plus which chat thread and unread state the footer button uses. */
export async function menuChrome(person: Person): Promise<{
  menuPerson: MenuPerson;
  chatHref: string;
  unreadChat: boolean;
}> {
  const [unread, gatewayConnection] = await Promise.all([
    getProducerUnread(person.id),
    loadGatewayConnectionState(person.id),
  ]);
  return {
    menuPerson: {
      fullName: person.full_name,
      email: person.email,
      npn: person.npn,
      npnStatus: person.npn_status,
      isBuilder: person.is_builder,
      photoUrl: approvedPhotoUrl(person),
      photoRejectionReason:
        person.photo_review_status === "rejected"
          ? person.photo_rejection_reason
          : null,
      discordConnected: Boolean(person.discord_webhook_url),
      gatewayConnection,
    },
    chatHref: person.is_builder ? "/producer/messages" : "/producer/upline",
    unreadChat: person.is_builder ? unread.team : unread.upline,
  };
}
