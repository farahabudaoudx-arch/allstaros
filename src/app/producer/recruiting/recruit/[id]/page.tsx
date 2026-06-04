import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type Person, type Recruit } from "@/lib/db/types";
import { phaseLabel, phaseStepLabel } from "@/lib/pipeline/labels";
import { deriveFunnelStage, funnelStageLabel } from "@/lib/pipeline/funnel";

type RecruitWithPerson = Recruit & { person: Pick<Person, "full_name" | "email"> };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-card px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}

type ExamOutcome = "passed" | "failed" | null;

// Did this recruit pass or fail their licensing exam? Reaching onboarding (or
// beyond) implies the license was approved, so the exam was passed.
function examResult(r: Pick<Recruit, "phase" | "phase_step" | "exam_failures">): ExamOutcome {
  if (r.phase_step === "exam_passed" || ["onboarding", "bootcamp", "graduated"].includes(r.phase)) {
    return "passed";
  }
  if ((r.exam_failures ?? 0) > 0) return "failed";
  return null;
}

// Bootcamp result: graduated = passed, flagged-in-bootcamp = failed, else TBD.
function bootcampResult(r: Pick<Recruit, "phase" | "flagged">): ExamOutcome {
  if (r.phase === "graduated") return "passed";
  if (r.phase === "bootcamp" && r.flagged) return "failed";
  return null;
}

function ResultValue({ result }: { result: ExamOutcome }) {
  if (!result) return <span className="text-mute">—</span>;
  return (
    <span className={result === "passed" ? "text-pos" : "text-neg"}>
      {result === "passed" ? "Passed" : "Failed"}
    </span>
  );
}

export default async function RecruitProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentPerson();
  if (!me) redirect(`/auth/signin?next=/producer/recruiting/recruit/${id}`);
  if (!me.is_builder) redirect("/producer");

  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  const recruit = data as unknown as RecruitWithPerson | null;
  if (!recruit) notFound();

  const { stage, outcome } = deriveFunnelStage(recruit);
  const stageLabel = funnelStageLabel(stage, outcome);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link
        href="/producer/recruiting"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Recruiting
      </Link>

      {/* Profile header */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-card p-5 md:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card-hi text-base font-semibold text-ink ring-1 ring-hairline">
          {initials(recruit.person.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            {recruit.person.full_name}
          </h1>
          <p className="mt-1 truncate text-sm text-subtle">{recruit.person.email}</p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/40 bg-accent/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {stageLabel}
        </span>
      </div>

      {recruit.flagged ? (
        <div className="mt-3 rounded-xl border border-warn/40 bg-warn/[0.08] px-4 py-3 text-sm text-warn">
          Flagged{recruit.flag_reason ? ` — ${recruit.flag_reason}` : ""}
        </div>
      ) : null}

      {/* Pipeline facts */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Phase" value={phaseLabel(recruit.phase).split(" — ")[0]} />
        <Fact label="Step" value={phaseStepLabel(recruit.phase_step)} />
        <Fact label="Signed up" value={fmtDate(recruit.created_at)} />
        <Fact label="Phone" value={recruit.phone || "—"} />
        <Fact label="State" value={recruit.state || "—"} />
        <Fact label="Exam date" value={fmtDate(recruit.exam_date)} />
        <Fact label="Exam" value={<ResultValue result={examResult(recruit)} />} />
        <Fact label="Bootcamp started" value={fmtDate(recruit.bootcamp_started_at)} />
        <Fact label="Bootcamp" value={<ResultValue result={bootcampResult(recruit)} />} />
      </div>

      <div className="mt-6">
        <Link
          href={`/producer/messages/${recruit.id}`}
          className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
        >
          Message {recruit.person.full_name.trim().split(/\s+/)[0]}
        </Link>
      </div>
    </main>
  );
}
