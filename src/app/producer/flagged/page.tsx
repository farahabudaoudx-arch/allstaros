import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeTeamFlags, type FlagCategory, type FlagItem } from "@/lib/producer/flags";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<FlagCategory, string> = {
  checkin: "Check-ins",
  data: "Missing data",
  activity: "Inactive",
  manual: "Flagged for review",
};

const CATEGORY_ORDER: FlagCategory[] = ["manual", "checkin", "activity", "data"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default async function FlaggedPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/flagged");
  if (!person.is_builder) redirect("/producer");

  const supabase = await createClient();
  const flags = await computeTeamFlags(supabase, person.id);

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: flags.filter((f) => f.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">My Team</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Flagged</h1>
          <p className="mt-3 max-w-2xl text-sm text-subtle">
            People in your downline who may need a nudge — stale check-ins, missing activity logs,
            and anyone you&apos;ve flagged for review.
          </p>
        </div>
        {flags.length > 0 ? (
          <span className="rounded-full border border-warn/40 bg-warn/[0.08] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-warn">
            {flags.length} {flags.length === 1 ? "flag" : "flags"}
          </span>
        ) : null}
      </div>

      {flags.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-pos/30 bg-pos/[0.05] px-5 py-16 text-center">
          <p className="text-base font-medium text-pos">All clear</p>
          <p className="mt-1.5 text-sm text-subtle">
            Nobody on your team is flagged right now.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.cat}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
                  {CATEGORY_LABEL[g.cat]}
                </h2>
                <span className="font-mono text-xs text-mute">{g.items.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                {g.items.map((f) => (
                  <FlagRow key={f.id} flag={f} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function FlagRow({ flag }: { flag: FlagItem }) {
  const dot = flag.severity === "neg" ? "bg-neg" : "bg-warn";
  const reasonTone = flag.severity === "neg" ? "text-neg" : "text-warn";
  return (
    <li>
      <Link
        href={flag.href}
        className="flex items-center gap-4 px-5 py-4 transition hover:bg-card-hi/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
          {initials(flag.personName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{flag.personName}</span>
            <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
          </div>
          <div className="mt-0.5 truncate text-xs text-mute">{flag.subtitle}</div>
        </div>
        <span className={`shrink-0 text-right text-xs font-medium ${reasonTone}`}>
          {flag.reason}
        </span>
        <span className="shrink-0 text-mute" aria-hidden>
          →
        </span>
      </Link>
    </li>
  );
}
