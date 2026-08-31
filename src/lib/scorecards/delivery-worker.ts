import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  deliverScorecardPublications,
  type ScorecardDeliveryRecord,
  type ScorecardDeliveryResult,
  type ScorecardPublicationMessage,
} from "./delivery";

const RETRY_DELAY_MS = 5 * 60 * 1_000;

export type ScorecardDeliveryStore = {
  loadDue(now: Date, limit: number): Promise<ScorecardDeliveryRecord[]>;
  claim(delivery: ScorecardDeliveryRecord, attemptedAt: string): Promise<boolean>;
  recordResult(result: ScorecardDeliveryResult, recordedAt: string): Promise<void>;
  refreshRun(runId: string, updatedAt: string): Promise<void>;
};

export type ScorecardDeliveryBatchSummary = {
  loaded: number;
  claimed: number;
  sent: number;
  failed: number;
  missingRecipient: number;
  skipped: number;
};

type DbDeliveryRow = {
  id: string;
  snapshot_id: string;
  delivery_type: "producer_email" | "builder_email";
  recipient_email: string | null;
  status: "pending" | "sent" | "failed" | "missing_recipient";
  idempotency_key: string;
  attempt_count: number;
  last_attempted_at: string | null;
  created_at: string;
};

type DbSnapshotRow = {
  id: string;
  person_id: string;
  card_type: "producer" | "builder";
  period_kind: "monthly" | "quarterly" | "annual";
  period_start: string;
  period_end: string;
  metric_run_id: string;
};

export function createSupabaseScorecardDeliveryStore(
  client = createServiceRoleClient(),
): ScorecardDeliveryStore {
  return {
    async loadDue(now, limit) {
      const fetchLimit = Math.max(limit * 3, limit);
      const { data, error } = await client
        .from("scorecard_delivery")
        .select("id, snapshot_id, delivery_type, recipient_email, status, idempotency_key, attempt_count, last_attempted_at, created_at")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: true })
        .limit(fetchLimit);
      if (error) throw new Error(`Unable to load Scorecard deliveries: ${error.message}`);

      const cutoff = now.getTime() - RETRY_DELAY_MS;
      const rows = ((data ?? []) as DbDeliveryRow[])
        .filter((row) => !row.last_attempted_at || Date.parse(row.last_attempted_at) <= cutoff)
        .slice(0, limit);
      if (rows.length === 0) return [];

      const { data: snapshotData, error: snapshotError } = await client
        .from("scorecard_snapshot")
        .select("id, person_id, card_type, period_kind, period_start, period_end, metric_run_id")
        .in("id", rows.map((row) => row.snapshot_id));
      if (snapshotError) throw new Error(`Unable to load published Scorecards for delivery: ${snapshotError.message}`);

      const snapshots = new Map(((snapshotData ?? []) as DbSnapshotRow[]).map((row) => [row.id, row]));
      return rows.map((row) => {
        const snapshot = snapshots.get(row.snapshot_id);
        if (!snapshot?.metric_run_id) {
          throw new Error(`Published Scorecard snapshot ${row.snapshot_id} is missing its authoritative run.`);
        }
        const expectedType = snapshot.card_type === "producer" ? "producer_email" : "builder_email";
        if (row.delivery_type !== expectedType) {
          throw new Error(`Scorecard delivery ${row.id} does not match snapshot ${row.snapshot_id}.`);
        }
        return {
          deliveryId: row.id,
          snapshotId: row.snapshot_id,
          runId: snapshot.metric_run_id,
          personId: snapshot.person_id,
          deliveryType: row.delivery_type,
          recipientEmail: row.recipient_email,
          status: row.status,
          idempotencyKey: row.idempotency_key,
          attemptCount: row.attempt_count,
          lastAttemptedAt: row.last_attempted_at,
          period: {
            kind: snapshot.period_kind,
            start: snapshot.period_start,
            end: snapshot.period_end,
          },
        } satisfies ScorecardDeliveryRecord;
      });
    },

    async claim(delivery, attemptedAt) {
      const { data, error } = await client
        .from("scorecard_delivery")
        .update({
          attempt_count: delivery.attemptCount + 1,
          last_attempted_at: attemptedAt,
        })
        .eq("id", delivery.deliveryId)
        .eq("attempt_count", delivery.attemptCount)
        .in("status", ["pending", "failed"])
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Unable to claim Scorecard delivery ${delivery.deliveryId}: ${error.message}`);
      return Boolean(data?.id);
    },

    async recordResult(result, recordedAt) {
      if (result.status === "already_sent") return;
      const values = result.status === "sent"
        ? {
            status: "sent",
            provider_message_id: result.providerMessageId,
            last_error: null,
            sent_at: recordedAt,
          }
        : result.status === "missing_recipient"
          ? {
              status: "missing_recipient",
              provider_message_id: null,
              last_error: result.error,
            }
          : {
              status: "failed",
              provider_message_id: null,
              last_error: result.error,
            };
      const { error } = await client
        .from("scorecard_delivery")
        .update(values)
        .eq("id", result.deliveryId);
      if (error) throw new Error(`Unable to record Scorecard delivery ${result.deliveryId}: ${error.message}`);
    },

    async refreshRun(runId, updatedAt) {
      const { data: snapshots, error: snapshotError } = await client
        .from("scorecard_snapshot")
        .select("id")
        .eq("metric_run_id", runId);
      if (snapshotError) throw new Error(`Unable to refresh Scorecard run ${runId}: ${snapshotError.message}`);
      const snapshotIds = (snapshots ?? []).map((row) => String(row.id));
      if (snapshotIds.length === 0) return;

      const { data: deliveries, error: deliveryError } = await client
        .from("scorecard_delivery")
        .select("status")
        .in("snapshot_id", snapshotIds);
      if (deliveryError) throw new Error(`Unable to refresh Scorecard delivery status for run ${runId}: ${deliveryError.message}`);
      const errorCount = (deliveries ?? []).filter((row) => row.status === "failed" || row.status === "missing_recipient").length;

      const { error } = await client
        .from("scorecard_metric_run")
        .update({
          status: errorCount > 0 ? "delivery_errors" : "published",
          delivery_error_count: errorCount,
          updated_at: updatedAt,
        })
        .eq("id", runId);
      if (error) throw new Error(`Unable to update Scorecard run ${runId}: ${error.message}`);
    },
  };
}

export async function processScorecardDeliveryOutbox({
  store,
  send,
  appBaseUrl,
  now = new Date(),
  limit = 50,
}: {
  store: ScorecardDeliveryStore;
  send: (message: ScorecardPublicationMessage) => Promise<{ messageId: string }>;
  appBaseUrl: string;
  now?: Date;
  limit?: number;
}): Promise<ScorecardDeliveryBatchSummary> {
  const deliveries = await store.loadDue(now, limit);
  const summary: ScorecardDeliveryBatchSummary = {
    loaded: deliveries.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    missingRecipient: 0,
    skipped: 0,
  };
  const affectedRuns = new Set<string>();
  const timestamp = now.toISOString();

  for (const delivery of deliveries) {
    if (!delivery.recipientEmail?.trim()) {
      const [result] = await deliverScorecardPublications({
        deliveries: [delivery],
        appBaseUrl,
        send,
      });
      await store.recordResult(result, timestamp);
      affectedRuns.add(delivery.runId);
      summary.missingRecipient += 1;
      continue;
    }

    const claimed = await store.claim(delivery, timestamp);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    const [result] = await deliverScorecardPublications({
      deliveries: [{ ...delivery, attemptCount: delivery.attemptCount + 1, lastAttemptedAt: timestamp }],
      appBaseUrl,
      send,
    });
    await store.recordResult(result, timestamp);
    affectedRuns.add(delivery.runId);
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "failed") summary.failed += 1;
    else if (result.status === "missing_recipient") summary.missingRecipient += 1;
    else summary.skipped += 1;
  }

  for (const runId of affectedRuns) {
    await store.refreshRun(runId, timestamp);
  }
  return summary;
}

export async function processPendingScorecardDeliveries({
  now = new Date(),
  limit = 50,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<ScorecardDeliveryBatchSummary> {
  const store = createSupabaseScorecardDeliveryStore();
  return processScorecardDeliveryOutbox({
    store,
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
