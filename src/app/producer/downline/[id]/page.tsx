import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { messageDownline, removeProducerForm, upgradeToBuilderForm } from "@/lib/actions/downline";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import type { Person, Recruit } from "@/lib/db/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-card px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-1 break-words text-sm text-ink">{value}</p>
    </div>
  );
}

export default async function DownlineProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const me = await getCurrentPerson();
  if (!me) redirect(`/auth/signin?next=/producer/downline/${id}`);
  if (!me.is_builder) redirect("/producer");

  // RLS returns the row only if id is in the builder's downline (or self).
  const supabase = await createClient();
  const { data } = await supabase
    .from("person")
    .select("id, full_name, email, phone, is_builder, is_producer, status, created_at, upline_id")
    .eq("id", id)
    .maybeSingle();
  const person = data as Pick<
    Person,
    "id" | "full_name" | "email" | "phone" | "is_builder" | "is_producer" | "status" | "created_at" | "upline_id"
  > | null;
  if (!person) notFound();

  // Their recruit row gives us state + the message thread to open.
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("id, state")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitData as Pick<Recruit, "id" | "state"> | null;

  const isMe = person.id === me.id;
  // Message / promote / remove are direct-upline-only powers. An indirect
  // upline can still open this profile and view analytics.
  const isDirect = !isMe && person.upline_id === me.id;
  const firstName = person.full_name.trim().split(/\s+/)[0] || person.full_name;
  const role = person.is_builder ? "Builder" : person.is_producer ? "Producer" : "Recruit";
  const roleLower = role.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link href="/producer/downline" className="text-sm text-mute transition hover:text-ink">
        ← My Downline
      </Link>

      {flash.error ? (
        <div className="mt-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(flash.error)}
        </div>
      ) : null}
      {flash.ok === "upgraded" ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Upgraded to builder.
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
          </h1>
          <p className="mt-1 truncate text-sm text-subtle">{person.email}</p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          {role}
        </span>
      </div>

      {/* Their information */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Email" value={person.email || "—"} />
        <Fact label="Phone" value={person.phone || "—"} />
        <Fact label="State" value={recruit?.state || "—"} />
        <Fact label="Role" value={role} />
        <Fact label="Status" value={person.status === "removed" ? "Removed" : "Active"} />
        <Fact label="Joined" value={fmtDate(person.created_at)} />
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/producer/team/${person.id}`}
          className="inline-flex items-center rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-mute"
        >
          View analytics
        </Link>

        {isDirect ? (
          <form action={messageDownline}>
            <input type="hidden" name="personId" value={person.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
            >
              Message {firstName}
            </button>
          </form>
        ) : null}

        {isDirect && person.is_producer && !person.is_builder ? (
          <form action={upgradeToBuilderForm}>
            <input type="hidden" name="personId" value={person.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-accent/50 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/[0.08]"
            >
              Promote to Builder
            </button>
          </form>
        ) : null}

        {isDirect ? (
          <form action={removeProducerForm}>
            <input type="hidden" name="personId" value={person.id} />
            <ConfirmSubmit
              label={`Remove ${roleLower}`}
              title={`Remove this ${roleLower}?`}
              message="Once you remove them you can't bring them back — all of their data will be removed. Make sure you're absolutely certain this is what you want to do."
              confirmLabel="Yes, remove them"
              className="inline-flex items-center rounded-full border border-neg/50 px-4 py-2 text-sm font-medium text-neg transition hover:bg-neg/[0.08]"
            />
          </form>
        ) : null}
      </div>

      {!isMe && !isDirect ? (
        <p className="mt-3 text-xs text-mute">
          {firstName} isn&apos;t directly under you — only their direct upline can message, promote,
          or remove them.
        </p>
      ) : null}
    </main>
  );
}
