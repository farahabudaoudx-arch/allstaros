import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsView } from "@/components/producer/AnalyticsView";
import type { Person, Recruit } from "@/lib/db/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Team member profile + analytics board. A builder opens any producer in their
 * downline here. RLS scopes both the person lookup and every analytics query to
 * the builder's downline, so this can only ever render someone they may view.
 */
export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const me = await getCurrentPerson();
  if (!me) redirect("/auth/signin?next=/producer/team");
  if (!me.is_builder) redirect("/producer");

  // RLS (person_select → can_view) returns the row only if id is the builder
  // themselves or somewhere in their downline; otherwise notFound.
  const supabase = await createClient();
  const { data } = await supabase
    .from("person")
    .select("id, full_name, email, is_builder, is_producer, status, upline_id")
    .eq("id", id)
    .maybeSingle();
  const person = data as Pick<
    Person,
    "id" | "full_name" | "email" | "is_builder" | "is_producer" | "status" | "upline_id"
  > | null;
  if (!person) notFound();

  const isMe = person.id === me.id;
  // Message is a direct-upline-only power and runs on the recruit's thread, so
  // we need their recruit row (and them to be directly under you).
  const isDirect = !isMe && person.upline_id === me.id;
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("id")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitData as Pick<Recruit, "id"> | null;
  const firstName = person.full_name.trim().split(/\s+/)[0] || person.full_name;
  const role = person.is_builder ? "Builder" : "Producer";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link
        href="/producer/team"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Team
      </Link>

      {flash.error ? (
        <div className="mt-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(flash.error)}
        </div>
      ) : null}

      {/* Profile header */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-card p-5 md:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card-hi text-base font-semibold text-ink ring-1 ring-hairline">
          {initials(person.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            {person.full_name}
            {isMe ? <span className="ml-2 text-base text-accent">(you)</span> : null}
          </h1>
          <p className="mt-1 truncate text-sm text-subtle">{person.email}</p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          {role}
        </span>
      </div>

      {/* Message a direct recruit straight from their team profile. Promote /
          remove still live on the Downline page. */}
      {isDirect && recruit ? (
        <div className="mt-6">
          <Link
            href={`/producer/messages/${recruit.id}`}
            className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
          >
            Message {firstName}
          </Link>
        </div>
      ) : !isMe && !isDirect ? (
        <p className="mt-4 text-xs text-mute">
          {firstName} isn&apos;t directly under you — only their direct upline can message them.
        </p>
      ) : null}

      {/* Their analytics board (read-only) */}
      <div className="mt-8">
        <AnalyticsView personId={person.id} title={`${firstName}'s Analytics`} />
      </div>
    </main>
  );
}
