import { GoalSettingsForm } from "@/components/producer/GoalSettingsForm";
import { ProfileSettingsForm } from "@/components/producer/ProfileSettingsForm";
import { PolicyContactSettingsForm } from "@/components/producer/PolicyContactSettingsForm";
import { BuilderSettingsForm } from "@/components/producer/BuilderSettingsForm";
import { NpnSettingsForm } from "@/components/producer/NpnSettingsForm";
import { DiscordSettingsSection } from "@/components/producer/DiscordSettingsSection";
import { SettingsHub, type SettingsHubSection } from "@/components/producer/SettingsHub";
import { getCurrentPerson } from "@/lib/auth";

const ICON_CLASS = "h-6 w-6 text-subtle";

function PolicyInfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <path d="M13.5 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5L13.5 3z" />
      <path d="M13.5 3v5.5H19" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19.2a6.5 6.5 0 0 1 11 0" />
    </svg>
  );
}

function NpnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M6 15.5a3 3 0 0 1 5 0" />
      <path d="M14 10h5" />
      <path d="M14 14h4" />
    </svg>
  );
}

function BuilderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" />
      <path d="M15 21h5v-9a1 1 0 0 0-1-1h-4" />
      <path d="M8 7h3" />
      <path d="M8 11h3" />
      <path d="M8 15h3" />
      <path d="M2.5 21h19" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8.5L7 20.5V17H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 10.5h.01" />
      <path d="M12 10.5h.01" />
      <path d="M16 10.5h.01" />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export default async function ProducerSettings() {
  const person = await getCurrentPerson();

  const sections: SettingsHubSection[] = [
    {
      key: "policy-info",
      title: "Policy Info Details",
      description:
        "The contact details clients see on the policy summary you send them, under “Your Client Coverage Specialist.” Leave any field blank to use your account details.",
      icon: <PolicyInfoIcon />,
      content: <PolicyContactSettingsForm />,
    },
    {
      key: "account",
      title: "Account Details",
      description:
        "Your name, sign-in email, and phone number for this account. These can differ from your policy info.",
      icon: <AccountIcon />,
      content: <ProfileSettingsForm />,
    },
    {
      key: "npn",
      title: "Producer Number (NPN)",
      description:
        "Your National Producer Number. We use it to issue your IP reports inside the platform. Once an admin verifies it, it’s locked here.",
      icon: <NpnIcon />,
      content: (
        <NpnSettingsForm
          initialNpn={person?.npn ?? ""}
          status={person?.npn_status ?? "missing"}
        />
      ),
    },
    ...(person?.is_builder
      ? ([
          {
            key: "builder",
            title: "Builder details",
            description:
              "Your recruiting invite code, plus the admin email and code your recruits use for contracting.",
            icon: <BuilderIcon />,
            content: <BuilderSettingsForm />,
          },
          {
            key: "discord",
            title: "Discord",
            description:
              "Post sales and team leaderboards to your Discord channels. Leaderboards track submitted AP for you and your full downline.",
            icon: <DiscordIcon />,
            content: <DiscordSettingsSection />,
          },
        ] satisfies SettingsHubSection[])
      : []),
    {
      key: "goal",
      title: "Your goal",
      description:
        "Set your monthly Annual Premium goal. The dashboard tracks month-to-date progress and reverse-engineers the daily activity you need to hit it.",
      icon: <GoalIcon />,
      content: <GoalSettingsForm />,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Settings</h1>
      <SettingsHub sections={sections} />
    </main>
  );
}
