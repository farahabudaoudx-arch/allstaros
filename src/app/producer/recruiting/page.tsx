import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type Person, type Recruit } from "@/lib/db/types";
import {
  FUNNEL_STAGES,
  deriveFunnelStage,
  funnelStageLabel,
  type FunnelStage,
} from "@/lib/pipeline/funnel";
import { InviteRecruit } from "./InviteRecruit";
import { RecruitTable, type RecruitListItem } from "./RecruitTable";

type Row = Recruit & { person: Pick<Person, "full_name" | "email" | "status"> };

type Bucket = { plain: number; passed: number; failed: number };

function StageBox({
  label,
  count,
  href,
  tone = "default",
}: {
  label: string;
  count: number;
  href: string;
  tone?: "default" | "pos" | "neg";
}) {
  const empty = count === 0;
  // Filled, color-coded bands: yellow for in-progress stages, green/red for the
  // pass/fail splits, faint for empty ones.
  const palette = empty
    ? { box: "border-hairline/60 bg-card/40", label: "text-mute", count: "text-mute" }
    : tone === "pos"
      ? { box: "border-pos/60 bg-pos/[0.16]", label: "text-pos", count: "text-ink" }
      : tone === "neg"
        ? { box: "border-neg/60 bg-neg/[0.16]", label: "text-neg", count: "text-ink" }
        : { box: "border-accent/60 bg-accent/[0.16]", label: "text-accent", count: "text-ink" };

  return (
    <div className={`rounded-xl border px-4 py-3 ${palette.box}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${palette.label}`}>
          {label}
        </span>
        <span className={`font-mono text-sm tabular-nums ${palette.count}`}>
          {count}
        </span>
      </div>
      {empty ? null : (
        <Link
          href={href}
          className="mt-2.5 inline-block rounded-full border border-hairline bg-card-hi px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle transition hover:border-mute hover:text-ink"
        >
          View {count === 1 ? "person" : "people"}
        </Link>
      )}
    </div>
  );
}

export default async function RecruitingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const spreadsheet = view === "spreadsheet";

  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/recruiting");
  if (!person.is_builder) redirect("/producer");

  // RLS scopes the recruit table to this builder's downline.
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .is("removed_at", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  const buckets = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s.key, { plain: 0, passed: 0, failed: 0 } as Bucket]),
  ) as Record<FunnelStage, Bucket>;

  const tableItems: RecruitListItem[] = rows.map((row) => {
    const { stage, outcome } = deriveFunnelStage(row);
    const bucket = buckets[stage];
    if (outcome === "passed") bucket.passed += 1;
    else if (outcome === "failed") bucket.failed += 1;
    else bucket.plain += 1;
    return {
      id: row.id,
      name: row.person.full_name,
      email: row.person.email,
      stageLabel: funnelStageLabel(stage, outcome),
      signedUpAt: row.created_at,
      flagged: row.flagged,
    };
  });

  const lastIndex = FUNNEL_STAGES.length - 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Builder</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Recruiting</h1>
          <p className="mt-3 max-w-2xl text-sm text-subtle">
            Where everyone in your downline sits in the recruiting pipeline.
          </p>
        </div>

        {/* Visual / Spreadsheet toggle */}
        <div className="flex items-center gap-1 rounded-full border border-hairline bg-card p-1">
          <Link
            href="/producer/recruiting"
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              spreadsheet ? "text-subtle hover:text-ink" : "bg-accent text-black"
            }`}
          >
            Visual
          </Link>
          <Link
            href="/producer/recruiting?view=spreadsheet"
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              spreadsheet ? "bg-accent text-black" : "text-subtle hover:text-ink"
            }`}
          >
            Spreadsheet
          </Link>
        </div>
      </div>

      {/* Invite a recruit by email — the only way an account is created. */}
      <InviteRecruit />

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card px-5 py-16 text-center text-subtle">
          No recruits in your downline yet.
        </div>
      ) : spreadsheet ? (
        <div className="mt-8">
          <RecruitTable items={tableItems} />
        </div>
      ) : (
        <div className="mt-8 space-y-2">
          {FUNNEL_STAGES.map((stage, i) => {
            const bucket = buckets[stage.key];
            // Each band steps narrower than the last to draw the funnel.
            const width = `${100 - (i / lastIndex) * 46}%`;

            return (
              <div
                key={stage.key}
                style={{ width, minWidth: "min(100%, 22rem)" }}
                className="mx-auto"
              >
                {stage.split ? (
                  <div className="grid grid-cols-2 gap-2">
                    <StageBox
                      label={stage.split.passed}
                      count={bucket.passed}
                      href={`/producer/recruiting/stage/${stage.key}?outcome=passed`}
                      tone="pos"
                    />
                    <StageBox
                      label={stage.split.failed}
                      count={bucket.failed}
                      href={`/producer/recruiting/stage/${stage.key}?outcome=failed`}
                      tone="neg"
                    />
                  </div>
                ) : (
                  <StageBox
                    label={stage.label}
                    count={bucket.plain}
                    href={`/producer/recruiting/stage/${stage.key}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
