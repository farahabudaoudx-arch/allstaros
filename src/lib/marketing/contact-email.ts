import { Resend } from "resend";

export const CONTACT_RECIPIENT = "Jakobsavage3@gmail.com";

export type ContactMessage = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendContactEmail(
  contact: ContactMessage,
  recipient = CONTACT_RECIPIENT,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured.");
  }

  const resend = new Resend(apiKey);
  const safe = {
    name: escapeHtml(contact.name),
    email: escapeHtml(contact.email),
    phone: escapeHtml(contact.phone || "Not provided"),
    subject: escapeHtml(contact.subject),
    message: escapeHtml(contact.message).replaceAll("\n", "<br />"),
  };

  const { data, error } = await resend.emails.send({
    from,
    to: recipient,
    replyTo: contact.email,
    subject: `All Star Website Contact: ${contact.subject}`,
    text: [
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone || "Not provided"}`,
      `Subject: ${contact.subject}`,
      "",
      contact.message,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.55;">
        <h1 style="font-size: 24px; margin: 0 0 24px;">New All Star Website Contact</h1>
        <p><strong>Name:</strong> ${safe.name}</p>
        <p><strong>Email:</strong> ${safe.email}</p>
        <p><strong>Phone:</strong> ${safe.phone}</p>
        <p><strong>Subject:</strong> ${safe.subject}</p>
        <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />
        <p>${safe.message}</p>
      </div>
    `,
  });

  if (error || !data?.id) {
    throw new Error(error?.message || "The email provider did not accept the message.");
  }

  return data.id;
}
