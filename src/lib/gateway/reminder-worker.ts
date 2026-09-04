import { sendEmail } from "@/lib/email";
import { gatewayConnectionReminderEmail } from "@/lib/emails/gateway-connection-reminder";
import { getAppUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  gatewayReminderBusinessDate,
  isGatewayReminderMonday,
  type GatewayReminderKind,
  type GatewayReminderVariant,
} from "./reminders";

const RETRY_DELAY_MS = 5 * 60 * 1_000;
const LAUNCH_MIDNIGHT_GRACE_MS = 10 * 60 * 1_000;

export type GatewayReminderDelivery = {
  id: string;
  personId: string;
  reminderKey: string;
  businessDate: string;
  variant: GatewayReminderVariant;
  emailStatus: "pending" | "failed";
  attemptCount: number;
  lastAttemptedAt: string | null;
  recipientEmail: string | null;
};

export type GatewayReminderEligibility = {
  connected: boolean;
  connectionInProgress: boolean;
};

export type GatewayReminderStore = {
  mintMonday(businessDate: string): Promise<number>;
  loadDue(businessDate: string, now: Date, limit: number): Promise<GatewayReminderDelivery[]>;
  eligibility(personId: string, now: Date): Promise<GatewayReminderEligibility>;
  claim(reminder: GatewayReminderDelivery, attemptedAt: string): Promise<boolean>;
  stillSendable(reminder: GatewayReminderDelivery): Promise<boolean>;
  cancel(reminderId: string, recordedAt: string): Promise<void>;
  recordMissingRecipient(reminderId: string, recordedAt: string): Promise<void>;
  recordSent(reminderId: string, providerMessageId: string, recordedAt: string): Promise<void>;
  recordFailed(reminderId: string, error: string, recordedAt: string): Promise<void>;
};

type DbReminderRow = {
  id: string;
  person_id: string;
  reminder_key: string;
  kind: GatewayReminderKind;
  business_date: string;
  variant: GatewayReminderVariant;
  email_status: "pending" | "failed";
  attempt_count: number;
  last_attempted_at: string | null;
  created_at: string;
};

export function gatewayReminderIsInDeliveryWindow(
  row: Pick<DbReminderRow, "kind" | "business_date" | "created_at">,
  businessDate: string,
  now: Date,
): boolean {
  if (row.business_date === businessDate) return true;
  if (row.kind !== "launch") return false;
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(createdAt)) return false;
  const age = now.getTime() - createdAt;
  return age >= 0 && age <= LAUNCH_MIDNIGHT_GRACE_MS;
}

export type GatewayReminderBatchSummary = {
  businessDate: string;
  mondayMinted: number;
  loaded: number;
  claimed: number;
  sent: number;
  failed: number;
  missingRecipient: number;
  cancelled: number;
  deferred: number;
  skipped: number;
};

export function createSupabaseGatewayReminderStore(
  client = createServiceRoleClient(),
): GatewayReminderStore {
  return {
    async mintMonday(businessDate) {
      const { data, error } = await client.rpc("mint_gateway_monday_reminders", {
        p_business_date: businessDate,
      });
      if (error) throw new Error(`Unable to mint Monday Gateway reminders: ${error.message}`);
      return Number(data ?? 0);
    },

    async loadDue(businessDate, now, limit) {
      const fetchLimit = Math.max(limit * 3, limit);
      const select = "id, person_id, reminder_key, kind, business_date, variant, email_status, attempt_count, last_attempted_at, created_at";
      const graceCreatedAfter = new Date(now.getTime() - LAUNCH_MIDNIGHT_GRACE_MS).toISOString();
      const [current, launchGrace] = await Promise.all([
        client
          .from("gateway_connection_reminder")
          .select(select)
          .eq("business_date", businessDate)
          .in("email_status", ["pending", "failed"])
          .order("created_at", { ascending: true })
          .limit(fetchLimit),
        client
          .from("gateway_connection_reminder")
          .select(select)
          .eq("kind", "launch")
          .neq("business_date", businessDate)
          .gte("created_at", graceCreatedAfter)
          .in("email_status", ["pending", "failed"])
          .order("created_at", { ascending: true })
          .limit(fetchLimit),
      ]);
      if (current.error) throw new Error(`Unable to load Gateway reminders: ${current.error.message}`);
      if (launchGrace.error) throw new Error(`Unable to load Gateway launch grace reminders: ${launchGrace.error.message}`);

      const cutoff = now.getTime() - RETRY_DELAY_MS;
      const rows = ([...(current.data ?? []), ...(launchGrace.data ?? [])] as DbReminderRow[])
        .filter((row) => gatewayReminderIsInDeliveryWindow(row, businessDate, now))
        .filter((row) => !row.last_attempted_at || Date.parse(row.last_attempted_at) <= cutoff)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .slice(0, limit);
      if (rows.length === 0) return [];

      const personIds = [...new Set(rows.map((row) => row.person_id))];
      const { data: people, error: peopleError } = await client
        .from("person")
        .select("id, email")
        .in("id", personIds);
      if (peopleError) throw new Error(`Unable to load Gateway reminder recipients: ${peopleError.message}`);
      const emails = new Map((people ?? []).map((person) => [String(person.id), person.email ? String(person.email) : null]));

      return rows.map((row) => ({
        id: row.id,
        personId: row.person_id,
        reminderKey: row.reminder_key,
        businessDate: row.business_date,
        variant: row.variant,
        emailStatus: row.email_status,
        attemptCount: row.attempt_count,
        lastAttemptedAt: row.last_attempted_at,
        recipientEmail: emails.get(row.person_id) ?? null,
      }));
    },

    async eligibility(personId, now) {
      const [connection, pending] = await Promise.all([
        client
          .from("gateway_connection")
          .select("status")
          .eq("person_id", personId)
          .maybeSingle(),
        client
          .from("gateway_connect_request")
          .select("expires_at")
          .eq("person_id", personId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (connection.error) throw new Error(`Unable to verify Gateway connection: ${connection.error.message}`);
      if (pending.error) throw new Error(`Unable to verify Gateway connect request: ${pending.error.message}`);
      const expiresAt = pending.data?.expires_at ? Date.parse(String(pending.data.expires_at)) : 0;
      return {
        connected: connection.data?.status === "connected",
        connectionInProgress: Number.isFinite(expiresAt) && expiresAt > now.getTime(),
      };
    },

    async claim(reminder, attemptedAt) {
      const { data, error } = await client
        .from("gateway_connection_reminder")
        .update({
          attempt_count: reminder.attemptCount + 1,
          last_attempted_at: attemptedAt,
          updated_at: attemptedAt,
        })
        .eq("id", reminder.id)
        .eq("attempt_count", reminder.attemptCount)
        .in("email_status", ["pending", "failed"])
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Unable to claim Gateway reminder ${reminder.id}: ${error.message}`);
      return Boolean(data?.id);
    },

    async stillSendable(reminder) {
      const { data, error } = await client
        .from("gateway_connection_reminder")
        .select("email_status, attempt_count")
        .eq("id", reminder.id)
        .maybeSingle();
      if (error) throw new Error(`Unable to recheck Gateway reminder ${reminder.id}: ${error.message}`);
      return Boolean(
        data &&
          (data.email_status === "pending" || data.email_status === "failed") &&
          Number(data.attempt_count) === reminder.attemptCount + 1,
      );
    },

    async cancel(reminderId, recordedAt) {
      const { error } = await client
        .from("gateway_connection_reminder")
        .update({ email_status: "cancelled", last_error: null, updated_at: recordedAt })
        .eq("id", reminderId)
        .in("email_status", ["pending", "failed"]);
      if (error) throw new Error(`Unable to cancel Gateway reminder ${reminderId}: ${error.message}`);
    },

    async recordMissingRecipient(reminderId, recordedAt) {
      const { error } = await client
        .from("gateway_connection_reminder")
        .update({
          email_status: "missing_recipient",
          last_error: "No recipient email is available.",
          updated_at: recordedAt,
        })
        .eq("id", reminderId);
      if (error) throw new Error(`Unable to record missing Gateway reminder recipient: ${error.message}`);
    },

    async recordSent(reminderId, providerMessageId, recordedAt) {
      const { error } = await client
        .from("gateway_connection_reminder")
        .update({
          email_status: "sent",
          provider_message_id: providerMessageId,
          sent_at: recordedAt,
          last_error: null,
          updated_at: recordedAt,
        })
        .eq("id", reminderId);
      if (error) throw new Error(`Unable to record Gateway reminder delivery: ${error.message}`);
    },

    async recordFailed(reminderId, errorMessage, recordedAt) {
      const { error } = await client
        .from("gateway_connection_reminder")
        .update({
          email_status: "failed",
          provider_message_id: null,
          last_error: errorMessage.slice(0, 500),
          updated_at: recordedAt,
        })
        .eq("id", reminderId);
      if (error) throw new Error(`Unable to record Gateway reminder failure: ${error.message}`);
    },
  };
}

export async function processGatewayReminderOutbox({
  store,
  send,
  appBaseUrl,
  now = new Date(),
  limit = 50,
}: {
  store: GatewayReminderStore;
  send: (message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) => Promise<{ messageId: string }>;
  appBaseUrl: string;
  now?: Date;
  limit?: number;
}): Promise<GatewayReminderBatchSummary> {
  const businessDate = gatewayReminderBusinessDate(now);
  const mondayMinted = isGatewayReminderMonday(now)
    ? await store.mintMonday(businessDate)
    : 0;
  const reminders = await store.loadDue(businessDate, now, limit);
  const summary: GatewayReminderBatchSummary = {
    businessDate,
    mondayMinted,
    loaded: reminders.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    missingRecipient: 0,
    cancelled: 0,
    deferred: 0,
    skipped: 0,
  };
  const timestamp = now.toISOString();

  for (const reminder of reminders) {
    const before = await store.eligibility(reminder.personId, now);
    if (before.connected) {
      await store.cancel(reminder.id, timestamp);
      summary.cancelled += 1;
      continue;
    }
    if (before.connectionInProgress) {
      summary.deferred += 1;
      continue;
    }

    const claimed = await store.claim(reminder, timestamp);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    const [after, sendable] = await Promise.all([
      store.eligibility(reminder.personId, now),
      store.stillSendable(reminder),
    ]);
    if (after.connected || !sendable) {
      if (after.connected) await store.cancel(reminder.id, timestamp);
      summary.cancelled += 1;
      continue;
    }
    if (after.connectionInProgress) {
      summary.deferred += 1;
      continue;
    }

    if (!reminder.recipientEmail?.trim()) {
      await store.recordMissingRecipient(reminder.id, timestamp);
      summary.missingRecipient += 1;
      continue;
    }

    const email = gatewayConnectionReminderEmail({
      variant: reminder.variant,
      appBaseUrl,
    });
    try {
      const result = await send({
        to: reminder.recipientEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `gateway-reminder:${reminder.personId}:${reminder.reminderKey}`,
      });
      await store.recordSent(reminder.id, result.messageId, timestamp);
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gateway reminder email error.";
      await store.recordFailed(reminder.id, message, timestamp);
      summary.failed += 1;
    }
  }

  return summary;
}

export async function processPendingGatewayReminders({
  now = new Date(),
  limit = 50,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<GatewayReminderBatchSummary> {
  return processGatewayReminderOutbox({
    store: createSupabaseGatewayReminderStore(),
    appBaseUrl: getAppUrl(),
    now,
    limit,
    send: async (message) => {
      const sent = await sendEmail({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        idempotencyKey: message.idempotencyKey,
      });
      if (!sent.ok) throw new Error(sent.error);
      return { messageId: sent.id };
    },
  });
}
