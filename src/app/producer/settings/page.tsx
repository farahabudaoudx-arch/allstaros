import { GoalSettingsForm } from "@/components/producer/GoalSettingsForm";
import { ProfileSettingsForm } from "@/components/producer/ProfileSettingsForm";
import { PolicyContactSettingsForm } from "@/components/producer/PolicyContactSettingsForm";
import { BuilderSettingsForm } from "@/components/producer/BuilderSettingsForm";
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

      {person?.is_builder && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Builder details</h2>
          <p className="mt-2 max-w-2xl text-sm text-subtle">
            Your recruiting invite code, admin email and code, and the Discord channel webhook we
            post to when your team signs a new client.
          </p>
          <BuilderSettingsForm />
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
