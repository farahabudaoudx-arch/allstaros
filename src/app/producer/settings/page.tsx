import { GoalSettingsForm } from "@/components/producer/GoalSettingsForm";
import { ProfileSettingsForm } from "@/components/producer/ProfileSettingsForm";
import { PolicyContactSettingsForm } from "@/components/producer/PolicyContactSettingsForm";
import { BuilderSettingsForm } from "@/components/producer/BuilderSettingsForm";
import { NpnSettingsForm } from "@/components/producer/NpnSettingsForm";
import { DiscordSettingsSection } from "@/components/producer/DiscordSettingsSection";
import { getCurrentPerson } from "@/lib/auth";

export default async function ProducerSettings() {
  const person = await getCurrentPerson();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Settings</h1>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Policy Info Details</h2>
        <p className="mt-2 max-w-2xl text-sm text-subtle">
          The contact details clients see on the policy summary you send them, under &ldquo;Your
          Client Coverage Specialist.&rdquo; Leave any field blank to use your account details.
        </p>
        <PolicyContactSettingsForm />
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Account Details</h2>
        <p className="mt-2 max-w-2xl text-sm text-subtle">
          Your name, sign-in email, and phone number for this account. These can differ from your
          policy info above.
        </p>
        <ProfileSettingsForm />
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          Producer Number (NPN)
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-subtle">
          Your National Producer Number. We use it to issue your IP reports inside the
          platform. Once an admin verifies it, it&apos;s locked here.
        </p>
        <NpnSettingsForm
          initialNpn={person?.npn ?? ""}
          status={person?.npn_status ?? "missing"}
        />
      </section>

      {person?.is_builder && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Builder details</h2>
          <p className="mt-2 max-w-2xl text-sm text-subtle">
            Your recruiting invite code, plus the admin email and code your recruits use for
            contracting.
          </p>
          <BuilderSettingsForm />
        </section>
      )}

      {person?.is_builder && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Discord</h2>
          <p className="mt-2 max-w-2xl text-sm text-subtle">
            Post sales and team leaderboards to your Discord channels. Leaderboards track
            submitted AP for you and your full downline.
          </p>
          <DiscordSettingsSection />
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Your goal</h2>
        <p className="mt-2 max-w-2xl text-sm text-subtle">
          Set your monthly Annual Premium goal. The dashboard tracks month-to-date progress and
          reverse-engineers the daily activity you need to hit it.
        </p>
        <GoalSettingsForm />
      </section>
    </main>
  );
}
