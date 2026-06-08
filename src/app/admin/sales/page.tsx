import { requireAdmin } from "@/lib/admin/guard";
import { LeaderboardView } from "@/components/producer/LeaderboardView";

/**
 * Org-wide sales. The leaderboard engine (computeLeaderboard, served by
 * /api/producer/leaderboard) is already org-wide and ranks every producer
 * across the full funnel — AP, sales, dials, contacts, presentations — with
 * range + metric controls. We reuse that view here under the admin gate.
 */
export default async function AdminSalesPage() {
  await requireAdmin();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Sales
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Organization-wide performance across the full funnel.
        </p>
      </div>
      <LeaderboardView />
    </main>
  );
}
