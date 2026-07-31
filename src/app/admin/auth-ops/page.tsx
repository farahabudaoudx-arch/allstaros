import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import {
  adminResendInvite,
  adminSendPasswordReset,
} from "@/lib/actions/admin/auth-ops";

type Row = {
  id: string;
  full_name: string;
  email: string;
  auth_user_id: string | null;
};

const FLASH: Record<string, string> = {
  invited: "Invite email sent.",
  pwreset: "Password-reset email sent.",
};

export default async function AdminAuthOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; q?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const q = (flash.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase
    .from("person")
    .select("id, full_name, email, auth_user_id")
    .order("full_name", { ascending: true })
    .limit(50);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);

  const people = ((await query).data ?? []) as Row[];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Auth Ops
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Resend setup invites and trigger password resets. Showing up to 50
          matches.
        </p>
      </div>

      <form method="get" className="mt-6 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email…"
          className="w-full max-w-md rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent"
        >
          Search
        </button>
      </form>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {FLASH[flash.ok] ?? "Done."}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {people.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-card p-5"
          >
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">
                {p.full_name}
              </h3>
              <p className="mt-1 truncate text-sm text-subtle">{p.email}</p>
              <p className="mt-0.5 text-xs text-mute">
                {p.auth_user_id ? "Account linked" : "Not yet set up"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={adminResendInvite}>
                <input type="hidden" name="personId" value={p.id} />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  Resend invite
                </button>
              </form>
              <form action={adminSendPasswordReset}>
                <input type="hidden" name="personId" value={p.id} />
                <button
                  type="submit"
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-accent hover:text-accent"
                >
                  Password reset
                </button>
              </form>
            </div>
          </div>
        ))}
        {people.length === 0 ? (
          <p className="text-sm text-mute">No matches.</p>
        ) : null}
      </div>
    </main>
  );
}
