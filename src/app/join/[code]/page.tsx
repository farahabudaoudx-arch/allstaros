import { notFound } from "next/navigation";
import { resolveBuilderByCode } from "@/lib/referral";
import { DEV_LOGIN_ENABLED } from "@/lib/devLogin";
import { JoinWizard } from "./JoinWizard";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { code } = await params;
  const { demo } = await searchParams;
  const builder = await resolveBuilderByCode(code);
  if (!builder) notFound();

  // Demo mode (dev only): walk the real signup wizard but, on finish, drop
  // straight into the seeded recruit's portal instead of creating a new account
  // and emailing a magic link.
  const isDemo = DEV_LOGIN_ENABLED && demo === "1";

  return (
    <JoinWizard code={code} builderName={builder.full_name} demo={isDemo} />
  );
}
