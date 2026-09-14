import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { authorizeCronRequest } from "@/lib/cron-auth";

// Vercel Cron endpoint. Configure in vercel.json. Vercel sends an
// Authorization: Bearer <CRON_SECRET> header on every invocation.
export async function GET(request: NextRequest) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("compute_stalls");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ affected: data ?? 0 });
}
