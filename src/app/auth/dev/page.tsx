import Image from "next/image";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { DEV_ACCOUNTS, devLoginAuthorized } from "@/lib/devLogin";

type SearchParams = Promise<{ error?: string; key?: string }>;

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, key } = await searchParams;
  if (!devLoginAuthorized(key)) notFound();

  // Carry the secret key through to the sign-in route so the deployed link
  // stays authorized on the next hop.
  const keySuffix = key ? `&key=${encodeURIComponent(key)}` : "";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={140}
            height={79}
            priority
            className="mx-auto h-10 w-auto"
          />
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-mute">
            Dev sign-in
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
            Pick a version
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Local only. Jumps straight into the recruit, producer, or builder
            experience.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
            {error === "signin"
              ? "Sign-in failed. Have you run `npm run seed:dev-users`?"
              : "Unknown role."}
          </div>
        ) : null}

        <div className="space-y-3">
          {DEV_ACCOUNTS.map((account) => (
            <a
              key={account.role}
              href={`/auth/dev/as?role=${account.role}${keySuffix}`}
              className={buttonClass(
                account.is_builder ? "primary" : "secondary",
                "w-full flex-col items-start gap-0.5 rounded-xl px-4 py-3 text-left",
              )}
            >
              <span className="text-sm font-semibold">{account.label}</span>
              <span className="text-xs font-normal opacity-70">
                {account.description}
              </span>
            </a>
          ))}

          {/* Walk the real recruit signup wizard, then land in the portal —
              no email or magic link needed. */}
          <a
            href={`/auth/dev/as?role=recruit&flow=demo${keySuffix}`}
            className={buttonClass(
              "secondary",
              "w-full flex-col items-start gap-0.5 rounded-xl px-4 py-3 text-left",
            )}
          >
            <span className="text-sm font-semibold">Recruit signup flow</span>
            <span className="text-xs font-normal opacity-70">
              Fill out the invite form, then drop into the recruit portal
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
