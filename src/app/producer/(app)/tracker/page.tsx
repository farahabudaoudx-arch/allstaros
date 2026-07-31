import { getCurrentPerson } from "@/lib/auth";
import { DialTracker } from "@/components/producer/DialTracker";

export default async function TrackerPage() {
  const person = await getCurrentPerson();
  const backHref = person?.is_builder ? "/producer/menu/personal" : "/producer";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <DialTracker backHref={backHref} />
    </main>
  );
}
