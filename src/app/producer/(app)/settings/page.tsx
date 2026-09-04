import { redirect } from "next/navigation";
import type { SettingsSectionKey } from "@/components/producer/menu/MenuSettingsDrawer";

/**
 * Settings has no page of its own any more — it lives in the drawer behind the
 * avatar, on whatever screen you're already on. This route stays only so old
 * links keep working: bookmarks, the headshot-rejection email, anything already
 * out in the wild. It forwards to the menu with the drawer open on the section
 * that was asked for.
 *
 * "goal" is deliberately absent: the goal now lives in the daily tracker, so
 * those links land on the settings list instead of a section that isn't there.
 */
const SECTIONS: Record<string, SettingsSectionKey> = {
  "policy-info": "policy-info",
  account: "account",
  npn: "npn",
  gateway: "gateway",
  builder: "builder",
  discord: "discord",
};

export default async function ProducerSettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const target = section ? SECTIONS[section] : undefined;
  redirect(`/producer?settings=${target ?? "1"}`);
}
