import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/site-url";
import {
  adminGenerateCode,
  adminRevokeCode,
} from "@/lib/actions/admin/referrals";

type Builder = { id: string; full_name: string };
type Referral = { builder_id: string; code: string };

export default async function AdminReferralCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();
  const appUrl = getAppUrl();

  const [{ data: builderData }, { data: referralData }] = await Promise.all([
    supabase
      .from("person")
      .select("id, full_name, is_builder")
      .eq("is_builder", true)
      .order("full_name", { ascending: true }),
    supabase.from("builder_referral").select("builder_id, code"),
  ]);

  const builders = (builderData ?? []) as Builder[];
  const codeByBuilder = new Map(
    ((referralData ?? []) as Referral[]).map((r) => [r.builder_id, r.code]),
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Builder Codes
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Builder invite links. Recruits sign up at{" "}
          <span className="text-xs">{appUrl}/join/&lt;code&gt;</span>.
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          Done.
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {builders.map((b) => {
          const code = codeByBuilder.get(b.id);
          return (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-card p-5"
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">
                  {b.full_name}
                </h3>
                {code ? (
                  <p className="mt-1 text-xs text-subtle">
                    {appUrl}/join/{code}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-mute">No code yet.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {code ? (
                  <form action={adminRevokeCode}>
                    <input type="hidden" name="builderId" value={b.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                    >
                      Revoke
                    </button>
                  </form>
                ) : (
                  <form action={adminGenerateCode}>
                    <input type="hidden" name="builderId" value={b.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                    >
                      Generate
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {builders.length === 0 ? (
          <p className="text-sm text-mute">No builders yet.</p>
        ) : null}
      </div>
    </main>
  );
}
