import { getCurrentPerson } from "@/lib/auth";
import { LeaderboardBoards } from "@/components/producer/leaderboard/LeaderboardBoards";

export default async function ProducerLeaderboardPage() {
  const person = await getCurrentPerson();
  const backHref = person?.is_builder ? "/producer/menu/personal" : "/producer";
  const defaultLiveScope = person?.is_builder ? "team" : "organization";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <LeaderboardBoards backHref={backHref} defaultLiveScope={defaultLiveScope} />
    </main>
  );
}
