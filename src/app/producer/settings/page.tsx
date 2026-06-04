import { GoalSettingsForm } from "@/components/producer/GoalSettingsForm";

export default function ProducerSettings() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Settings</h1>

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
