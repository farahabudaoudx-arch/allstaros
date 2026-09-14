import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { WelcomeFlow } from "./WelcomeFlow";
import { getInstallationBrand } from "@/lib/installation/config";
import { InstallationBrandProvider } from "@/lib/installation/brand-context";

/**
 * Account setup: where an invited recruit lands after clicking their invite
 * link. The link already signed them in via /auth/confirm and already knows
 * their email, so we don't ask for it again; we just confirm who invited them
 * and which email their account is under, then collect name/phone/state/password.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/welcome");

  const email = user.email ?? "";
  const brand = await getInstallationBrand();

  // Who invited them = their upline builder. RLS doesn't let a fresh recruit
  // read up the tree, so look up the builder's name with the service role.
  let inviterName = "";
  const { data: me } = await supabase
    .from("person")
    .select("upline_id, is_producer, is_builder")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const meRow = me as
    | { upline_id?: string | null; is_producer?: boolean; is_builder?: boolean }
    | null;
  const uplineId = meRow?.upline_id;
  // Licensed invitees (producers/builders) are asked for their NPN during setup;
  // unlicensed recruits are not (they have no NPN yet).
  const licensed = !!(meRow?.is_producer || meRow?.is_builder);
  if (uplineId) {
    const admin = createServiceRoleClient();
    const { data: builder } = await admin
      .from("person")
      .select("full_name")
      .eq("id", uplineId)
      .maybeSingle();
    inviterName = (builder as { full_name?: string } | null)?.full_name ?? "";
  }

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-16">
      <InstallationBrandProvider brand={brand}>
        <WelcomeFlow licensed={licensed} inviterName={inviterName} email={email} />
      </InstallationBrandProvider>
    </div>
  );
}
