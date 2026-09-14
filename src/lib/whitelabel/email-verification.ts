import "server-only";

type FetchLike = typeof fetch;

export type EmailVerificationResult =
  | {
      ok: true;
      providerName: "Resend";
      accountRef: string;
      accountLabel: string;
      billingUrl: string;
    }
  | { ok: false; error: string };

function senderDomain(emailFrom: string): string | null {
  const bracket = emailFrom.match(/<([^<>]+)>/);
  const address = (bracket?.[1] ?? emailFrom).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  return at > 0 ? address.slice(at + 1) : null;
}

export async function verifyResendSenderAccess(
  params: { accessToken: string; emailFrom: string },
  fetchImpl: FetchLike = fetch,
): Promise<EmailVerificationResult> {
  const domain = senderDomain(params.emailFrom);
  if (!domain) return { ok: false, error: "The configured sender identity does not contain a valid domain." };

  try {
    const response = await fetchImpl("https://api.resend.com/domains?limit=100", {
      method: "GET",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Resend access was denied. Confirm the customer API key has permission to read domains, then retry." };
    }
    if (!response.ok) {
      return { ok: false, error: "Resend access could not be verified. Retry after confirming the provider is available." };
    }
    const body = (await response.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        status?: string;
        capabilities?: { sending?: string };
      }>;
    };
    const match = body.data?.find((row) => row.name?.toLowerCase() === domain);
    if (!match?.id) {
      return { ok: false, error: `Resend does not contain the sender domain ${domain} in this customer account.` };
    }
    if (match.status !== "verified" || match.capabilities?.sending === "disabled") {
      return { ok: false, error: `Resend sender domain ${domain} is not ready for sending yet. Complete its DNS verification, then retry.` };
    }
    return {
      ok: true,
      providerName: "Resend",
      accountRef: match.id,
      accountLabel: domain,
      billingUrl: "https://resend.com/domains",
    };
  } catch {
    return { ok: false, error: "Resend access could not be verified. Retry after confirming the provider is available." };
  }
}
