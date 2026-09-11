import type { InviteRole } from "@/lib/invite/batch";

/**
 * The producer app's sidebar nav.
 *
 * This is a plain data tree with no React and no server imports, so the client
 * sidebar and any server code can both read it. It sits alongside the tile
 * menu (PRODUCER_MENU_TILES) rather than replacing it: the tiles are the home
 * screen, the sidebar is the always-there shortcut to the same pages.
 */

export type NavLink = {
  label: string;
  /** Where the item goes. Omitted on action items (see `add`). */
  href?: string;
  /** Opens in a new tab via a plain anchor, e.g. a carrier's own site. */
  external?: boolean;
  /** Opens the invite popup in place instead of navigating anywhere. */
  add?: { title: string; role: InviteRole };
  /** Shown but not yet built — dimmed and unclickable, same as a locked tile. */
  locked?: boolean;
  /** The item's artwork, reused from the old tile menu at rail size. Items with
   *  no art still reserve the slot, so every label stays on the same line. */
  icon?: string;
};

export type NavGroup = {
  label: string;
  items: NavLink[];
  icon?: string;
};

export type NavEntry = NavLink | NavGroup;

/** A titled block of the sidebar. Producers get one untitled block; builders
 *  get Personal, Team and Recruits. */
export type NavSection = {
  heading?: string;
  entries: NavEntry[];
};

export function isGroup(entry: NavEntry): entry is NavGroup {
  return Array.isArray((entry as NavGroup).items);
}

/** Everything a producer can reach. For a builder this is the "Personal"
 *  block, so the two roles can never drift apart. */
const PERSONAL: NavEntry[] = [
  {
    label: "Scorecards",
    href: "/producer/scorecards",
    icon: "/menu-icons/producer/scorecards.png",
  },
  {
    label: "Daily Tracker",
    href: "/producer/tracker",
    icon: "/menu-icons/producer/daily-tracker.png",
  },
  {
    label: "Production",
    icon: "/menu-icons/producer/production-dark.png",
    items: [
      {
        label: "Activity Analytics",
        href: "/producer/analytics",
        icon: "/menu-icons/my-numbers/analytics.png",
      },
      {
        label: "Leads",
        href: "/producer/lead-spend",
        icon: "/menu-icons/my-numbers/lead-spend-tracker.png",
      },
      {
        label: "Issued Premium",
        href: "/producer/issued-premium",
        icon: "/menu-icons/my-numbers/issued-premium-reports.png",
      },
      {
        label: "Clients",
        href: "/producer/clients",
        icon: "/menu-icons/producer/clients.png",
      },
      {
        label: "Leaderboard",
        href: "/producer/leaderboard",
        icon: "/menu-icons/producer/leaderboard.png",
      },
    ],
  },
  {
    label: "Training",
    icon: "/menu-icons/producer/training.png",
    items: [
      // Previous Live Recordings isn't listed here on purpose — it hangs off
      // the Training Calendar page, since that's where you go looking for a
      // call you missed.
      {
        label: "Training Calendar",
        href: "/producer/trainings/upcoming",
        icon: "/menu-icons/training/training-calendar.png",
      },
      {
        label: "Agent Vlogs",
        href: "/producer/trainings/all-star-tv",
        icon: "/menu-icons/training/all-star-tv.png",
      },
      {
        label: "Live Calls",
        href: "/producer/trainings/live-dials",
        icon: "/menu-icons/training/live-dials.png",
      },
      {
        label: "Case Studies",
        href: "/producer/trainings/case-studies",
        icon: "/menu-icons/training/case-studies.png",
      },
      {
        label: "Bootcamp",
        locked: true,
        icon: "/menu-icons/training/bootcamp.png",
      },
    ],
  },
  {
    label: "Resources & Tools",
    // The wrench, under its own filename rather than replacing the old
    // notebook art in place: image URLs are cached hard, so an overwrite would
    // have kept serving the old picture to anyone who'd already loaded it.
    icon: "/menu-icons/producer/tools.png",
    items: [
      {
        label: "Sidekick",
        href: "/allstar-ai",
        icon: "/menu-icons/resources/sidekick.png",
      },
      {
        label: "Underwriting Wizard",
        href: "/underwriting",
        icon: "/menu-icons/resources/underwriting-wizard.png",
      },
      {
        label: "Scripts",
        href: "/producer/resources/scripts",
        icon: "/menu-icons/resources/scripts.png",
      },
      {
        label: "Carrier Links",
        href: "/producer/resources/portal-links",
        icon: "/menu-icons/resources/carrier-links.png",
      },
      {
        label: "Carrier Contacts",
        href: "/producer/resources/carrier-contacts",
        icon: "/menu-icons/resources/carrier-contacts.png",
      },
      {
        label: "App Guides",
        href: "https://mytrustedadvisor.wixsite.com/eappguides",
        external: true,
        icon: "/menu-icons/resources/app-guides.png",
      },
      {
        label: "Merch",
        href: "https://all-star.clothing/",
        external: true,
        icon: "/menu-icons/producer/merch.png",
      },
    ],
  },
];

const TEAM: NavEntry[] = [
  {
    label: "Add Team Member",
    add: { title: "Add Team Member", role: "producer" },
    icon: "/menu-icons/team/add-team-member.png",
  },
  {
    label: "Downline Tree",
    href: "/producer/downline",
    icon: "/menu-icons/team/my-downline.png",
  },
  {
    label: "Team Performance",
    href: "/producer/team",
    icon: "/menu-icons/team/team-performance.png",
  },
];

const RECRUITS: NavEntry[] = [
  {
    label: "Add Recruit",
    add: { title: "Add Recruit", role: "recruit" },
    icon: "/menu-icons/recruits/add-recruit.png",
  },
  {
    label: "Recruiting Pipeline",
    href: "/producer/recruiting",
    icon: "/menu-icons/recruits/recruiting-pipeline.png",
  },
];

export function producerNav(isBuilder: boolean): NavSection[] {
  if (!isBuilder) return [{ entries: PERSONAL }];
  return [
    { heading: "Personal", entries: PERSONAL },
    { heading: "Team", entries: TEAM },
    { heading: "Recruits", entries: RECRUITS },
  ];
}

/** Every internal destination in the tree, for active-item matching. */
export function navHrefs(sections: NavSection[]): string[] {
  const out: string[] = [];
  for (const section of sections) {
    for (const entry of section.entries) {
      const links = isGroup(entry) ? entry.items : [entry];
      for (const link of links) {
        if (link.href && !link.external) out.push(link.href);
      }
    }
  }
  return out;
}

/** Longest matching prefix, so a detail route highlights its section. */
export function activeHref(
  pathname: string,
  hrefs: string[],
): string | undefined {
  return hrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}
