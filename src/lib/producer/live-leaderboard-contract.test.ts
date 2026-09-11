import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Live Leaderboard security and semantic contracts", () => {
  it("keeps public capability storage service-role only and rotation atomic", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260909000100_live_leaderboard_capabilities.sql"), "utf8");
    expect(sql).toContain("alter table public.live_leaderboard_capability enable row level security");
    expect(sql).toContain("revoke all on public.live_leaderboard_capability from anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on public.live_leaderboard_capability to service_role");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.rotate_live_leaderboard_capability(uuid, uuid, text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.rotate_live_leaderboard_capability(uuid, uuid, text) to service_role");
    expect(sql).not.toContain("expires_at");
    expect(sql.indexOf("set revoked_at = now()")).toBeGreaterThan(-1);
    expect(sql.indexOf("insert into public.live_leaderboard_capability")).toBeGreaterThan(sql.indexOf("set revoked_at = now()"));
  });

  it("matches canonical counted-deal semantics for Live without changing legacy Discord filtering", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/producer/submitted-ap-leaderboard.ts"), "utf8");
    expect(source).toContain("strictSaleStatus?: boolean");
    expect(source).toContain('query.or("sale_status.eq.sale,sale_status.is.null")');
    expect(source).toContain("strictSaleStatus: true");
    expect(source).toContain('statusById.get(id) !== "active"');
    expect(source).not.toContain('opts.scope.kind === "team" && statusById.get(id) !== "active"');
  });
});
