import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const baseSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260903000300_gateway_connection_reminders.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const fixSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260904000100_gateway_connection_reminder_fixes.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const sql = `${baseSql}\n${fixSql}`;

describe("Gateway reminder SQL boundary", () => {
  it("dedupes both logical reminder keys and one popup/email cycle per business date", () => {
    expect(sql).toContain("unique (person_id, reminder_key)");
    expect(sql).toContain("gateway_connection_reminder_one_cycle_per_business_date_idx");
    expect(sql).toContain("(person_id, business_date)");
  });

  it("does not start Monday recurrence before first open, even for a previously-connected member", () => {
    expect(sql).toContain("launch.reminder_key = 'launch:v1'");
    expect(sql).toContain("and exists (\n      select 1 from public.gateway_connection_reminder launch");
  });

  it("materializes and locks connection state before minting a first-open occurrence", () => {
    expect(sql).toContain("insert into public.gateway_connection (person_id)");
    expect(sql).toContain("where c.person_id = p_person_id\n  for update;");
  });

  it("supports an idempotent Monday occurrence on first app open before the cron tick", () => {
    expect(sql).toContain("ensure_gateway_monday_reminder");
    expect(sql).toContain("'monday:' || p_business_date::text");
  });

  it("uses reconnect copy on first open when the member had connected before", () => {
    expect(sql).toContain("case when v_first_connected_at is null then 'connect' else 'reconnect' end");
    expect(sql).toContain("if v_status = 'connected' then");
  });

  it("suppresses connected members and an active hosted-login attempt", () => {
    expect(sql).toContain("coalesce(c.status, 'disconnected') <> 'connected'");
    expect(sql).toContain("q.status = 'pending'");
    expect(sql).toContain("q.expires_at > now()");
  });

  it("cancels unsent reminders whenever a trusted Gateway completion connects the member", () => {
    expect(sql).toContain("gateway_connection_cancel_reminders_when_connected");
    expect(sql).toContain("when email_status in ('pending', 'failed') then 'cancelled'");
  });

  it("keeps reminder RPCs service-role only", () => {
    for (const signature of [
      "ensure_gateway_launch_reminder(uuid, date)",
      "ensure_gateway_monday_reminder(uuid, date)",
      "mint_gateway_monday_reminders(date)",
      "dismiss_gateway_connection_reminder(uuid, uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature}`);
      expect(sql).toContain("from public, anon, authenticated;");
      expect(sql).toContain(`grant execute on function public.${signature}`);
    }
  });
});
