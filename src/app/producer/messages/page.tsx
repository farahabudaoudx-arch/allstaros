import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CheckIn, Message, Person, Recruit } from "@/lib/db/types";

type Row = Recruit & { person: Pick<Person, "full_name" | "email" | "status"> };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Builder Messages hub. Lists the builder's downline recruits (RLS scopes the
 * recruit query to self + downline) with a preview of the latest message and
 * their most recent check-in, each opening the full two-way thread.
 */
export default async function ProducerMessagesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/messages");
  if (!person.is_builder) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .order("created_at", { ascending: false });
  const rows = (recruitData ?? []) as unknown as Row[];

  const recruitIds = rows.map((r) => r.id);

  // Latest builder-channel message per recruit (one query, group client-side).
  const lastMessage = new Map<string, Message>();
  // Latest check-in date per recruit.
  const lastCheckIn = new Map<string, string>();
  if (recruitIds.length > 0) {
    const [{ data: msgRows }, { data: checkInRows }] = await Promise.all([
      supabase
        .from("message")
        .select("*")
        .in("recruit_id", recruitIds)
        .eq("channel", "builder")
        .order("created_at", { ascending: false }),
      supabase
        .from("check_in")
        .select("recruit_id, check_in_date")
        .in("recruit_id", recruitIds)
        .order("check_in_date", { ascending: false }),
    ]);
    for (const m of (msgRows ?? []) as Message[]) {
      if (!lastMessage.has(m.recruit_id)) lastMessage.set(m.recruit_id, m);
    }
    for (const c of (checkInRows ?? []) as Pick<
      CheckIn,
      "recruit_id" | "check_in_date"
    >[]) {
      if (!lastCheckIn.has(c.recruit_id)) {
        lastCheckIn.set(c.recruit_id, c.check_in_date);
      }
    }
  }

  // Float the most recently active conversations to the top.
  const sorted = [...rows].sort((a, b) => {
    const am = lastMessage.get(a.id)?.created_at ?? "";
    const bm = lastMessage.get(b.id)?.created_at ?? "";
    return bm.localeCompare(am);
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Builder
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Messages
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Chat with your downline. Check-ins from your recruits show up here too.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No recruits in your downline yet.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
          {sorted.map((row) => {
            const last = lastMessage.get(row.id);
            const checkIn = lastCheckIn.get(row.id);
            const removed =
              row.person.status === "removed" || row.removed_at;
            return (
              <li key={row.id}>
                <Link
                  href={`/producer/messages/${row.id}`}
                  className={`flex items-center gap-4 px-4 py-4 transition hover:bg-card-hi ${
                    removed ? "opacity-40" : ""
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-xs font-semibold text-ink ring-1 ring-hairline">
                    {initials(row.person.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-ink">
                        {row.person.full_name}
                      </span>
                      {last ? (
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                          {new Date(last.created_at).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-subtle">
                      {last ? last.body : "No messages yet — say hello."}
                    </p>
                  </div>
                  {checkIn ? (
                    <span className="hidden shrink-0 rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:inline">
                      Checked in {checkIn}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
