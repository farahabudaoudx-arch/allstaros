import { createHash, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTALLED_GATEWAY_AGENT_TOKEN_SHA256 =
  "d01c9a08aaee13ceaea3721b81c2b8e6a368aa1bc8f4da80f0a56908b61777f2";

function uploadToken(): string | null {
  return process.env.GATEWAY_AGENT_UPLOAD_TOKEN?.trim() || null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function authorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!bearer) return false;

  const expected = uploadToken();
  if (expected && auth === `Bearer ${expected}`) return true;

  return safeEqualHex(sha256(bearer), INSTALLED_GATEWAY_AGENT_TOKEN_SHA256);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Agency-wide Gateway uploads are retired. Issued Premium is filled from each person's own Gateway connection.",
    },
    { status: 410 },
  );
}
