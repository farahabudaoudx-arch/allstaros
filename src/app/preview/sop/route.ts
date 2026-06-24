import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Preview-only: serve the standalone SOP HTML as real HTML (not text/plain) at
// /preview/sop. The file is self-contained — its own <style> and inlined media —
// so it renders exactly as authored without the admin chrome.
export async function GET() {
  try {
    const file = path.join(process.cwd(), "public", "sops", "uploading-to-bunnystream.html");
    const html = await readFile(file, "utf8");
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse("SOP not found", { status: 404 });
  }
}
