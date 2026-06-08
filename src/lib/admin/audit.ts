import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Append a row to the admin audit log. Best-effort: a logging failure must never
 * roll back the action it records. Inserted via the service role.
 */
export async function writeAudit(params: {
  actorId: string | null;
  action: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("admin_audit").insert({
      actor_person_id: params.actorId,
      action: params.action,
      target_person_id: params.targetId ?? null,
      detail: params.detail ?? {},
    });
  } catch {
    // Swallow — auditing is best-effort.
  }
}
