import { createServiceRoleClient } from "@/lib/supabase/server";
import type { GatewayConnectionState } from "./connection-types";

export const GATEWAY_REMINDER_TIME_ZONE = "America/Chicago";

export type GatewayReminderVariant = "connect" | "reconnect";
export type GatewayReminderKind = "launch" | "monday";

export type GatewayReminderPresentation = {
  id: string;
  reminderKey: string;
  kind: GatewayReminderKind;
  businessDate: string;
  variant: GatewayReminderVariant;
  popupDismissedAt: string | null;
};

type ReminderRow = {
  id: string;
  reminder_key: string;
  kind: GatewayReminderKind;
  business_date: string;
  variant: GatewayReminderVariant;
  popup_dismissed_at: string | null;
  email_status: "pending" | "sent" | "failed" | "missing_recipient" | "cancelled";
};

const chicagoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GATEWAY_REMINDER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const chicagoWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: GATEWAY_REMINDER_TIME_ZONE,
  weekday: "short",
});

export function gatewayReminderBusinessDate(now = new Date()): string {
  const parts = chicagoDateFormatter.formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function isGatewayReminderMonday(now = new Date()): boolean {
  return chicagoWeekdayFormatter.format(now) === "Mon";
}

export function suppressGatewayLaunchAfterExplicitDisconnect(
  state: GatewayConnectionState,
  businessDate: string,
): boolean {
  if (
    state.status !== "disconnected" ||
    !state.everConnected ||
    !state.promptDismissedAt
  ) {
    return false;
  }
  const dismissedAt = new Date(state.promptDismissedAt);
  if (Number.isNaN(dismissedAt.getTime())) return false;
  return gatewayReminderBusinessDate(dismissedAt) === businessDate;
}

function presentation(row: ReminderRow): GatewayReminderPresentation {
  return {
    id: row.id,
    reminderKey: row.reminder_key,
    kind: row.kind,
    businessDate: row.business_date,
    variant: row.variant,
    popupDismissedAt: row.popup_dismissed_at,
  };
}

async function loadReminderForBusinessDate(
  personId: string,
  businessDate: string,
): Promise<GatewayReminderPresentation | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("gateway_connection_reminder")
    .select("id, reminder_key, kind, business_date, variant, popup_dismissed_at, email_status")
    .eq("person_id", personId)
    .eq("business_date", businessDate)
    .neq("email_status", "cancelled")
    .maybeSingle();
  if (error) return null;
  return data ? presentation(data as ReminderRow) : null;
}

async function loadReminderById(
  personId: string,
  reminderId: string,
): Promise<GatewayReminderPresentation | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("gateway_connection_reminder")
    .select("id, reminder_key, kind, business_date, variant, popup_dismissed_at, email_status")
    .eq("person_id", personId)
    .eq("id", reminderId)
    .neq("email_status", "cancelled")
    .maybeSingle();
  if (error) return null;
  return data ? presentation(data as ReminderRow) : null;
}

/**
 * Resolve the reminder occurrence the app shell should show right now.
 * Rendering never sends email. A first-open occurrence is only persisted once;
 * delivery happens out-of-band through the existing cron worker.
 */
export async function loadGatewayReminderPresentation(
  personId: string,
  state: GatewayConnectionState,
  now = new Date(),
): Promise<GatewayReminderPresentation | null> {
  if (
    state.status === "unavailable" ||
    state.connected ||
    state.connectionInProgress
  ) {
    return null;
  }

  const businessDate = gatewayReminderBusinessDate(now);
  const existing = await loadReminderForBusinessDate(personId, businessDate);
  if (existing) return existing;

  if (suppressGatewayLaunchAfterExplicitDisconnect(state, businessDate)) {
    return null;
  }

  const service = createServiceRoleClient();
  const launch = await service.rpc("ensure_gateway_launch_reminder", {
    p_person_id: personId,
    p_business_date: businessDate,
  });
  if (launch.error) return null;
  let reminderId = typeof launch.data === "string" ? launch.data : null;

  if (isGatewayReminderMonday(now)) {
    const monday = await service.rpc("ensure_gateway_monday_reminder", {
      p_person_id: personId,
      p_business_date: businessDate,
    });
    if (!monday.error && typeof monday.data === "string") {
      reminderId = monday.data;
    }
  }

  // Query by the returned id instead of repeating the exact business-date GET.
  // Next request memoization can otherwise reuse the pre-RPC "no row" result
  // during the same server render and delay the first-open popup until reload.
  return reminderId ? loadReminderById(personId, reminderId) : null;
}

export async function dismissGatewayReminderForPerson(
  personId: string,
  reminderId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("dismiss_gateway_connection_reminder", {
    p_person_id: personId,
    p_reminder_id: reminderId,
  });
  if (error || data !== true) {
    throw new Error("Unable to save your Gateway reminder preference.");
  }
}
