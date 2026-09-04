import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260903000200_gateway_connections.sql"),
  "utf8",
);

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("\n$$;", start) + "\n$$;".length;
  return sql.slice(start, end);
}

describe("Gateway personal connection SQL boundary", () => {
  it("stores opaque session references and immutable first-connect evidence without credentials", () => {
    expect(sql).toContain("session_ref text");
    expect(sql).toContain("session_generation bigint not null default 0");
    expect(sql).toContain("first_connected_at timestamptz");
    expect(sql).toContain("initial_backfill_completed_at timestamptz");
    expect(sql).not.toMatch(/password\s+(text|varchar)/i);
    expect(sql).not.toMatch(/two_factor|2fa_code|otp_code/i);
    expect(sql).not.toMatch(/cookie\s+(text|varchar)/i);
  });

  it("keeps only one pending connect request and cancels an older attempt before creating a new one", () => {
    const begin = functionBody("begin_gateway_connection");
    expect(sql).toContain("gateway_connect_request_one_pending_person_idx");
    expect(begin).toContain("where person_id = p_person_id and status = 'pending'");
    expect(begin).toContain("set status = case when expires_at <= now() then 'expired' else 'cancelled' end");
    expect(begin).toContain("select session_generation + 1 into v_generation");
    expect(begin).not.toContain("session_ref = null");
  });

  it("rejects expired/superseded callbacks and completes under row locks", () => {
    const complete = functionBody("complete_gateway_connection");
    expect(complete).toContain("for update");
    expect(complete).toContain("gateway_connect_request_not_pending");
    expect(complete).toContain("gateway_connect_request_expired");
    expect(complete).toContain("gateway_connect_request_superseded");
    expect(complete).toContain("session_generation = v_request.target_generation");
    expect(complete).toContain("first_connected_at = coalesce(first_connected_at, v_now)");
  });

  it("disconnect cancels pending callbacks and advances generation", () => {
    const disconnect = functionBody("disconnect_gateway_connection");
    expect(disconnect).toContain("where person_id = p_person_id and status = 'pending'");
    expect(disconnect).toContain("set status = 'cancelled'");
    expect(disconnect).toContain("session_generation = session_generation + 1");
    expect(disconnect).toContain("session_ref = null");
    expect(disconnect).toContain("prompt_dismissed_at = now()");
  });

  it("lets a future worker invalidate only the exact verified session generation", () => {
    const reconnect = functionBody("mark_gateway_connection_needs_reconnect");
    expect(reconnect).toContain("and session_generation = p_session_generation");
    expect(reconnect).toContain("and status = 'connected'");
    expect(reconnect).toContain("return v_rows > 0");
  });

  it("exposes lifecycle RPCs only to service_role", () => {
    for (const name of [
      "begin_gateway_connection(uuid, text, timestamptz)",
      "complete_gateway_connection(text, text)",
      "fail_gateway_connection_request(text, text)",
      "disconnect_gateway_connection(uuid)",
      "dismiss_gateway_connection_prompt(uuid)",
      "mark_gateway_connection_needs_reconnect(uuid, bigint, text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${name} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${name} to service_role;`);
    }
  });
});