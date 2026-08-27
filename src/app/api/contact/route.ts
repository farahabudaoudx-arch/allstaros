import { CONTACT_RECIPIENT, sendContactEmail, type ContactMessage } from "@/lib/marketing/contact-email";

export const runtime = "nodejs";

const recentSubmissions = new Map<string, number>();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validate(body: Record<string, unknown>): ContactMessage | null {
  const contact = {
    name: readString(body.name, 120),
    email: readString(body.email, 254).toLowerCase(),
    phone: readString(body.phone, 50),
    subject: readString(body.subject, 160).replace(/[\r\n]+/g, " "),
    message: readString(body.message, 5000),
  };

  if (
    contact.name.length < 2 ||
    !EMAIL_PATTERN.test(contact.email) ||
    contact.subject.length < 2 ||
    contact.message.length < 10
  ) {
    return null;
  }

  return contact;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ message: "Invalid form submission." }, { status: 400 });
  }

  // Silently accept bot submissions without sending them.
  if (readString(body.company, 200)) {
    return Response.json({ message: "Your message has been sent." });
  }

  const contact = validate(body);
  if (!contact) {
    return Response.json(
      { message: "Please complete every required field with valid information." },
      { status: 400 },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = forwardedFor || "local";
  const lastSubmission = recentSubmissions.get(clientKey) || 0;
  if (Date.now() - lastSubmission < 30_000) {
    return Response.json(
      { message: "Please wait a moment before sending another message." },
      { status: 429 },
    );
  }

  try {
    const id = await sendContactEmail(contact, CONTACT_RECIPIENT);
    recentSubmissions.set(clientKey, Date.now());
    return Response.json({ id, message: "Your message has been sent." });
  } catch (error) {
    console.error("Contact email failed", error);
    return Response.json(
      { message: "We could not send your message right now. Please try again shortly." },
      { status: 500 },
    );
  }
}
