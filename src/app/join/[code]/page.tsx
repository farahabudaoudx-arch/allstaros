import { notFound } from "next/navigation";
import { resolveBuilderByCode } from "@/lib/referral";
import { JoinWizard } from "./JoinWizard";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const builder = await resolveBuilderByCode(code);
  if (!builder) notFound();

  return <JoinWizard code={code} builderName={builder.full_name} />;
}
