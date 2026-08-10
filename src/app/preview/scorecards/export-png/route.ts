const MAX_PNG_BYTES = 10 * 1024 * 1024;

function safeFilename(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "scorecard.png";
  const clean = value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return clean.toLowerCase().endsWith(".png") ? clean : `${clean || "scorecard"}.png`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const png = formData.get("png");
  if (typeof png !== "string" || !png.startsWith("data:image/png;base64,")) {
    return new Response("Invalid PNG payload", { status: 400 });
  }

  const bytes = Buffer.from(png.slice("data:image/png;base64,".length), "base64");
  if (!bytes.length || bytes.length > MAX_PNG_BYTES) {
    return new Response("PNG payload is empty or too large", { status: 413 });
  }

  return new Response(bytes, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${safeFilename(formData.get("filename"))}"`,
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
    },
  });
}
