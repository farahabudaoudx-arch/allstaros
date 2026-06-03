import { notFound } from "next/navigation";
import { resolveBuilderByCode } from "@/lib/referral";
import { getCurrentPerson } from "@/lib/auth";
import { devAccountByRole } from "@/lib/devLogin";
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

  // Demo mode: walk the real signup wizard but, on finish, drop straight into
  // the seeded recruit's portal instead of creating a new account and emailing a
  // magic link. Gated to the signed-in demo recruit (by email) rather than the
  // dev-login flag, so the "Show full flow" replay also works on the deployed
  // site. A real visitor signing up never sees demo mode.
  const person = demo === "1" ? await getCurrentPerson() : null;
  const isDemo = person?.email === devAccountByRole("recruit")?.email;

  return (
    <JoinWizard code={code} builderName={builder.full_name} demo={isDemo} />
  );
}
