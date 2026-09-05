"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import {
  completeGatewayConnectRequest,
  disconnectGatewayForPerson,
} from "@/lib/gateway/connection";
import { dismissGatewayReminderForPerson } from "@/lib/gateway/reminders";

function eligible(person: Awaited<ReturnType<typeof getCurrentPerson>>) {
  return Boolean(
    person &&
      person.status === "active" &&
      (person.is_producer || person.is_builder),
  );
}

function refreshGatewaySurfaces() {
  revalidatePath("/producer");
  revalidatePath("/producer/issued-premium");
  revalidatePath("/producer/menu/my-numbers");
  revalidatePath("/producer/scorecards");
  revalidatePath("/producer/settings");
}

export async function disconnectGateway() {
  const person = await getCurrentPerson();
  if (!eligible(person) || !person) return { ok: false as const, error: "Not authorized." };
  try {
    await disconnectGatewayForPerson(person.id);
    refreshGatewaySurfaces();
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Unable to disconnect Gateway right now." };
  }
}

export async function dismissGatewayPrompt(reminderId: string) {
  const person = await getCurrentPerson();
  if (!eligible(person) || !person) return { ok: false as const, error: "Not authorized." };
  try {
    await dismissGatewayReminderForPerson(person.id, reminderId);
    revalidatePath("/producer");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Unable to save your choice right now." };
  }
}

/**
 * Development-only hosted-connector harness.
 * The production connection path is completed only by the authenticated
 * Gateway callback; this action never persists credentials or verification codes.
 */
export async function completeGatewayDevelopmentConnection(formData: FormData) {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_LOGIN_ENABLED !== "true") {
    throw new Error("Gateway development connection harness is disabled.");
  }
  const person = await getCurrentPerson();
  if (!eligible(person) || !person) redirect("/auth/signin?next=/producer");

  const state = String(formData.get("state") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/producer?settings=gateway");
  const twoFactorRequested = formData.get("twoFactorRequested") === "1";
  const twoFactorCode = String(formData.get("twoFactorCode") ?? "").trim();
  if (twoFactorRequested && !twoFactorCode) {
    redirect(`/producer/gateway/connect/mock?state=${encodeURIComponent(state)}&challenge=2fa&error=code_required&next=${encodeURIComponent(returnTo)}`);
  }

  // The opaque development reference contains no username, password, cookie,
  // verification code, or other reusable Gateway authentication material.
  const developmentSessionRef = `dev-harness:${crypto.randomUUID()}`;
  await completeGatewayConnectRequest(state, developmentSessionRef, person.id);
  refreshGatewaySurfaces();
  redirect(returnTo.startsWith("/producer") ? returnTo : "/producer?settings=gateway");
}
