import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resolveLandingPath } from "@/lib/auth";
import {
  DEV_LOGIN_ENABLED,
  DEV_LOGIN_PASSWORD,
  devAccountByRole,
} from "@/lib/devLogin";
import { resetDevRecruitByPersonId } from "@/lib/devReset";

/**
 * Dev-only: reset the seeded recruit to the very start of licensing so the
 * portal always opens on step 1 with nothing filled in — handy for demoing the
 * one-step-at-a-time unlock flow. Never runs outside the dev-login gate.
 */
async function resetDevRecruit(authUserId: string) {
  const admin = createServiceRoleClient();
  const { data: person } = await admin
    .from("person")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!person) return;
  await resetDevRecruitByPersonId(person.id);
}

export async function GET(request: NextRequest) {
  if (!DEV_LOGIN_ENABLED) {
    return new NextResponse("Not found", { status: 404 });
  }

  const role = request.nextUrl.searchParams.get("role") ?? "";
  const account = devAccountByRole(role);
  if (!account) {
    return NextResponse.redirect(new URL("/auth/dev?error=role", request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: DEV_LOGIN_PASSWORD,
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/auth/dev?error=signin", request.url));
  }

  if (account.role === "recruit") {
    await resetDevRecruit(data.user.id);
  }

  const path = await resolveLandingPath(supabase, data.user.id);
  return NextResponse.redirect(new URL(path, request.url));
}
