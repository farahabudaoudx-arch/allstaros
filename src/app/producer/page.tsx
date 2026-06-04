import { EventSchedule } from "@/components/producer/EventSchedule";
import { DashboardOverview } from "@/components/producer/DashboardOverview";
import { ProducerGoals } from "@/components/producer/ProducerGoals";
import { DailyProjections } from "@/components/producer/DailyProjections";
import { TodaySnapshot } from "@/components/producer/TodaySnapshot";
import { getCurrentPerson } from "@/lib/auth";

function greet(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function ProducerDashboard() {
  const person = await getCurrentPerson();
  const firstName = person?.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Greeting name={firstName} hello={greet(now)} />

      <TodaySnapshot />

      <ProducerGoals />

      <DailyProjections />

      <EventSchedule />

      <DashboardOverview />
    </main>
  );
}

function Greeting({
  name,
  hello,
}: {
  name: string;
  hello: string;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-6xl">
          {hello}, <span className="italic text-accent">{name}.</span>
        </h1>
      </div>
    </div>
  );
}

