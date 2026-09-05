"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPerson } from "@/lib/auth";
import {
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
