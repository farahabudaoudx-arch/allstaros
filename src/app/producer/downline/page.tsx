import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/db/types";
import { InviteProducer } from "./InviteProducer";

export const dynamic = "force-dynamic";

type Row = Pick<
  Person,
  "id" | "full_name" | "email" | "is_builder" | "is_producer" | "upline_id" | "auth_user_id"
>;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function roleLabel(p: Row): string {
  if (p.is_builder) return "Builder";
  if (p.is_producer) return "Producer";
  return "Recruit";
}

export default async function DownlinePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const me = await getCurrentPerson();
  if (!me) redirect("/auth/signin?next=/producer/downline");
  if (!me.is_builder) redirect("/producer");
  const flash = await searchParams;

  // RLS (can_view) returns the FULL recursive downline plus yourself. We keep
  // only ACTIVE PRODUCERS (and builders, who are producers too) — recruits live
  // in the Recruiting Pipeline. A producer recruited by one of your builders is
  // layers down but still in your downline, so they belong here.
  const supabase = await createClient();
  const { data } = await supabase
    .from("person")
    .select("id, full_name, email, is_builder, is_producer, upline_id, auth_user_id")
    .eq("status", "active")
    .or("is_producer.eq.true,is_builder.eq.true")
    .order("full_name", { ascending: true });
  const all = (data ?? []) as Row[];

  // Map every id → name so we can show who each person reports to.
  const nameById = new Map<string, string>([[me.id, me.full_name]]);
  for (const p of all) nameById.set(p.id, p.full_name);

  // Direct reports first, then everyone deeper, each alphabetical.
  const people = all
    .filter((p) => p.id !== me.id)
    .sort((a, b) => {
      const ad = a.upline_id === me.id ? 0 : 1;
      const bd = b.upline_id === me.id ? 0 : 1;
      return ad - bd || a.full_name.localeCompare(b.full_name);
    });

  const directCount = people.filter((p) => p.upline_id === me.id).length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">My Team</p>
      <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">My Downline</h1>
      <p className="mt-3 max-w-2xl text-sm text-subtle">
        Every active producer in your downline — your direct producers and everyone producing
        beneath them, at any level. Recruits live in the Recruiting Pipeline.{" "}
        {people.length} total · {directCount} direct.
      </p>

      <InviteProducer />

      {flash.ok === "removed" ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Removed.
        </div>
      ) : null}

      {people.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No producers in your downline yet.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
          {people.map((p) => {
            const direct = p.upline_id === me.id;
            const uplineName = p.upline_id ? nameById.get(p.upline_id) : null;
            // No linked auth user => they've never accepted their invite yet.
            const pending = !p.auth_user_id;
            return (
              <li key={p.id}>
                <Link
                  href={`/producer/downline/${p.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-card-hi/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                    {initials(p.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">
                      {pending ? p.email : p.full_name}
                    </div>
                    <div className="truncate text-xs text-mute">
                      {direct ? (
                        <span className="text-accent">Direct to you</span>
                      ) : (
                        <>Under {uplineName ?? "—"}</>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      pending
                        ? "border-warn/40 bg-warn/[0.08] text-warn"
                        : "border-pos/40 bg-pos/[0.08] text-pos"
                    }`}
                  >
                    {pending ? "Invite Sent" : "Active Profile"}
                  </span>
                  <span className="hidden shrink-0 rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:inline">
                    {roleLabel(p)}
                  </span>
                  <span className="shrink-0 text-mute" aria-hidden>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
