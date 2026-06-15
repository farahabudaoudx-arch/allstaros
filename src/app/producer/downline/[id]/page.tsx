import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  messageDownline,
  removeProducerForm,
  resendProducerInvite,
  updateProducerInfo,
  upgradeToBuilderForm,
} from "@/lib/actions/downline";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { US_STATES } from "@/lib/us-states";
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
    .select("id, full_name, email, phone, is_builder, is_producer, status, created_at, upline_id, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  const person = data as Pick<
    Person,
    "id" | "full_name" | "email" | "phone" | "is_builder" | "is_producer" | "status" | "created_at" | "upline_id" | "auth_user_id"
  > | null;
  if (!person) notFound();

  // Their recruit row gives us state + the message thread to open. Read it with
  // the service role so state always resolves regardless of where in the tree
  // they sit (the recruit-select RLS can be stricter than person-select).
  const admin = createServiceRoleClient();
  const { data: recruitData } = await admin
    .from("recruit")
    .select("id, state")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitData as Pick<Recruit, "id" | "state"> | null;

  const isMe = person.id === me.id;
  // No linked auth user => they've never accepted their invite yet.
  const pending = !person.auth_user_id;
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
      {flash.ok === "saved" ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Changes saved.
        </div>
      ) : null}
      {flash.ok === "resent" ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Invite resent.
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full border border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            {role}
          </span>
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
              pending
                ? "border-warn/40 bg-warn/[0.08] text-warn"
                : "border-pos/40 bg-pos/[0.08] text-pos"
            }`}
          >
            {pending ? "Invite Sent" : "Active Profile"}
          </span>
        </div>
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

        {isDirect && pending ? (
          <form action={resendProducerInvite}>
            <input type="hidden" name="personId" value={person.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-mute"
            >
              Resend invite
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

      {isDirect ? (
        <details className="mt-6 rounded-2xl border border-hairline bg-card p-5 md:p-6">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink">
            <span className="inline-flex items-center gap-2">
              <span className="text-mute" aria-hidden>✎</span> Edit {firstName}&rsquo;s info
            </span>
          </summary>
          <form action={updateProducerInfo} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="personId" value={person.id} />
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Full name</span>
              <input
                name="fullName"
                type="text"
                required
                defaultValue={pending ? "" : person.full_name}
                placeholder="First Last"
                className="rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Email</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={person.email}
                placeholder="name@example.com"
                className="rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
              />
              {pending ? (
                <span className="text-[11px] text-mute">
                  Wrong address? Fix it here, then use Resend invite to send a fresh link.
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Phone</span>
              <input
                name="phone"
                type="tel"
                defaultValue={person.phone ?? ""}
                placeholder="(555) 555-5555"
                className="rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">State</span>
              <select
                name="state"
                defaultValue={recruit?.state ?? ""}
                className="rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
              >
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
              >
                Save changes
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </main>
  );
}
