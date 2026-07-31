import { createServiceRoleClient } from "@/lib/supabase/server";
import { AnalyticsView } from "@/components/producer/AnalyticsView";

export const dynamic = "force-dynamic";

export default async function ProducerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  // Local-dev only: ?as=Full Name renders another person's board (and their
  // official Gateway Hall of Fame figure) without their login. Ignored in
  // production builds, so it can never leak real data.
  const { as } = await searchParams;
  let personId: string | undefined;
  let title = "Activity";
  if (as && process.env.NODE_ENV === "development") {
    const service = createServiceRoleClient();
    const { data: target } = await service
      .from("person")
      .select("id, full_name")
      .ilike("full_name", as)
      .maybeSingle();
    if (target) {
      personId = target.id;
      title = `${target.full_name}'s Activity (dev)`;
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <AnalyticsView personId={personId} title={title} backHref="/producer/menu/my-numbers" />
    </main>
  );
}
