import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type Person, type Recruit } from "@/lib/db/types";
import {
  FUNNEL_STAGES,
  deriveFunnelStage,
  funnelStageLabel,
  type FunnelOutcome,
  type FunnelStage,
} from "@/lib/pipeline/funnel";

type Row = Recruit & { person: Pick<Person, "full_name" | "email"> };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default async function StagePage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { stage } = await params;
  const { outcome: outcomeParam } = await searchParams;

  const meta = FUNNEL_STAGES.find((s) => s.key === stage);
  if (!meta) notFound();
  const stageKey = meta.key as FunnelStage;
  const outcome: FunnelOutcome | undefined =
    outcomeParam === "passed" || outcomeParam === "failed" ? outcomeParam : undefined;

  const me = await getCurrentPerson();
  if (!me) redirect(`/auth/signin?next=/producer/recruiting/stage/${stageKey}`);
  if (!me.is_builder) redirect("/producer");

  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email)")
    .is("removed_at", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];
  const people = rows.filter((r) => {
    const d = deriveFunnelStage(r);
    if (d.stage !== stageKey) return false;
    if (outcome) return d.outcome === outcome;
    return true;
  });

  const title = funnelStageLabel(stageKey, outcome);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link
        href="/producer/recruiting"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Recruiting
      </Link>

      <div className="mt-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Stage</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-subtle">
          {people.length} {people.length === 1 ? "person" : "people"} in this stage.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-hairline bg-card">
        {people.length === 0 ? (
          <div className="px-5 py-16 text-center text-subtle">No one is in this stage yet.</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {people.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/producer/recruiting/recruit/${r.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-card-hi/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-xs font-semibold text-ink ring-1 ring-hairline">
                    {initials(r.person.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{r.person.full_name}</span>
                      {r.flagged ? <span className="size-1.5 shrink-0 rounded-full bg-warn" /> : null}
                    </span>
                    <span className="block truncate text-xs text-mute">{r.person.email}</span>
                  </span>
                  <span className="shrink-0 text-mute">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
