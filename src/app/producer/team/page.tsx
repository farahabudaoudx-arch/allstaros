import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { TeamView } from "@/components/producer/TeamView";

export default async function TeamPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/team");
  if (!person.is_builder) redirect("/producer");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Builder</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Team</h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Your whole downline. Pick a timeframe, then open any producer to see their full analytics.
        </p>
      </div>

      {/* Interactive roster + timeframe controls (client). */}
      <TeamView />
    </main>
  );
}
