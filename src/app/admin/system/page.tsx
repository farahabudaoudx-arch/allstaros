import { requireSuperAdmin } from "@/lib/admin/guard";

type Check = { label: string; ok: boolean; note?: string };

function configChecks(): Check[] {
  const has = (v: string | undefined) => !!v && v.length > 0;
  return [
    { label: "Supabase URL", ok: has(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    {
      label: "Supabase service role key",
      ok: has(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    { label: "Resend (email)", ok: has(process.env.RESEND_API_KEY) },
    { label: "Anthropic (AI)", ok: has(process.env.ANTHROPIC_API_KEY) },
    {
      label: "Bunny — recruiting library",
      ok:
        has(process.env.BUNNY_RECRUITING_LIBRARY_ID) &&
        has(process.env.BUNNY_RECRUITING_API_KEY),
    },
    {
      label: "Bunny — live library",
      ok:
        has(process.env.BUNNY_LIVE_LIBRARY_ID) &&
        has(process.env.BUNNY_LIVE_API_KEY),
    },
    {
      label: "Dev login",
      ok: process.env.DEV_LOGIN_ENABLED === "true",
      note: "Should be OFF in production.",
    },
  ];
}

export default async function AdminSystemPage() {
  await requireSuperAdmin();
  const checks = configChecks();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Super Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          System
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Integration configuration status. Presence only — secret values are
          never displayed.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-hairline">
        <ul>
          {checks.map((c) => (
            <li
              key={c.label}
              className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm text-ink">{c.label}</p>
                {c.note ? (
                  <p className="text-xs text-mute">{c.note}</p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${
                  c.ok
                    ? "bg-accent/10 text-accent ring-accent/30"
                    : "bg-red-500/10 text-red-400 ring-red-500/30"
                }`}
              >
                {c.ok ? "Configured" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">Destructive operations</h2>
        <p className="mt-2 text-sm text-subtle">
          Hard deletes, bulk operations, and impersonation are intentionally not
          exposed in the UI yet — they remain manual (service role / SQL) so they
          can&apos;t be triggered by accident. Role changes flow through{" "}
          <span className="font-medium text-ink">Roles &amp; Minting</span> and
          are recorded in the <span className="font-medium text-ink">Audit Log</span>.
        </p>
      </section>
    </main>
  );
}
