import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Vercel Cron endpoint. Configure in vercel.json. Vercel sends an
// Authorization: Bearer <CRON_SECRET> header on every invocation.
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("compute_stalls");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ affected: data ?? 0 });
}
