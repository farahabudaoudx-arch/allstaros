"use client";

import { Document, Page, Text, View, StyleSheet, Image, pdf } from "@react-pdf/renderer";
import type { Client } from "@/lib/clients/types";
import { CARRIER_LOGOS, CARRIER_SUPPORT_PHONES, formatSharePct } from "@/lib/clients/types";

export type AgentInfo = { name: string; email: string; phone?: string };

function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatIssueDate(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return trimmed;
}

function dayWithSuffix(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function derivePaymentDate(monthly: string | null | undefined, issueDate: string | null | undefined): string {
  const explicit = monthly?.trim();
  if (explicit) return explicit;
  const m = issueDate?.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (m) return `${dayWithSuffix(Number(m[1]))} of every month`;
  return "—";
}

function PolicyPromiseDoc({ client, agent }: { client: Client; agent: AgentInfo }) {
  const quotes = client.quotes ?? [];
  const chosenIdx = client.chosen_quote_index;
  const quote =
    (chosenIdx != null ? quotes[chosenIdx] : undefined) ??
    quotes.find((q) => q.carrier) ??
    quotes[0] ??
    {};
  const carrier = quote.carrier ?? "—";
  // @react-pdf/renderer can't render SVG via <Image src>, so drop SVG logos
  // for the PDF — the PDF already gracefully skips when logoSrc is empty.
  const rawLogo = quote.carrier ? CARRIER_LOGOS[quote.carrier] : undefined;
  const logoSrc = rawLogo && !/\.svg(\?|$)/i.test(rawLogo) ? rawLogo : undefined;
  const supportPhone = quote.carrier ? CARRIER_SUPPORT_PHONES[quote.carrier] ?? "—" : "—";

  const insuredName = (client.client_name || "—").toUpperCase();
  const payorName = (client.payor_name?.trim() || client.client_name || "—").toUpperCase();
  const monthlyPremium = formatMoney(quote.premium);
  const policyNumber = client.policy_number?.trim() || "—";
  const writtenOn = formatIssueDate(client.submit_date);
  const issuedOn = formatIssueDate(client.issue_date);
  const monthlyPaymentDate = derivePaymentDate(client.monthly_payment_date, client.issue_date);

  // Policy notes (riders etc.) print here. Private/internal notes are
  // intentionally never surfaced on this client-facing summary.
  const notes = client.policy_notes?.trim() || "";

  const beneficiaries = (client.beneficiaries ?? []).filter(
    (b) => b.name?.trim() || b.relationship?.trim() || b.email?.trim() || b.phone?.trim(),
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Policy Info For {insuredName}</Text>
          <Text style={styles.heroBody}>
            Thanks for trusting us to set up your life insurance policy.
            You took a great step towards protecting the future for your loved ones.
            Below are the details of your policy.
          </Text>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.col}>
            <Text style={styles.sectionHeader}>Policy Details</Text>
            <Detail label="Insurance Company" value={carrier} />
            <Detail label="Policy Number" value={policyNumber} />
            <Detail label="Monthly Premium" value={monthlyPremium} />
            <Detail label="Product Type" value={quote.policy_type ?? "Whole Life"} />
            <Detail label="Insured Name" value={insuredName} />
            <Detail label="Payor Name" value={payorName} />
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionHeader}>Dates &amp; Payment</Text>
            <Detail label="Policy Written On" value={writtenOn} />
            <Detail label="Policy Issued On" value={issuedOn} />
            <Detail label="Monthly Payment (Date/Day)" value={monthlyPaymentDate} />
          </View>
        </View>

        {beneficiaries.length ? (
          <View style={styles.beneBlock}>
            <Text style={styles.sectionHeader}>Beneficiaries</Text>
            {beneficiaries.map((b, i) => {
              const share = formatSharePct(b.share);
              return (
                <View key={i} style={styles.beneRow}>
                  <Text style={styles.beneName}>
                    {(b.name?.trim() || "—") +
                      (b.relationship?.trim() ? ` (${b.relationship.trim()})` : "") +
                      (share ? ` — ${share}` : "")}
                  </Text>
                  {b.email?.trim() || b.phone?.trim() ? (
                    <Text style={styles.beneContact}>
                      {[b.phone?.trim(), b.email?.trim()].filter(Boolean).join("  •  ")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionHeader}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.supportHeadline}>For Support You Can Reach Out To...</Text>

        <View style={styles.supportStack}>
          <View>
            <Text style={styles.supportLabel}>Your Client Coverage Specialist:</Text>
            <Text style={styles.supportLine}>{agent.name}</Text>
            {agent.phone ? <Text style={styles.supportLine}>{agent.phone}</Text> : null}
            <Text style={styles.supportLine}>{agent.email}</Text>
          </View>

          <Text style={styles.supportOrText}>Or...</Text>

          <View>
            <Text style={styles.supportLabel}>Your Insurance Provider&apos;s Customer Support Line:</Text>
            <Text style={styles.supportLine}>{carrier}</Text>
            <Text style={styles.supportLine}>{supportPhone}</Text>
          </View>
        </View>

        <View style={styles.bottomBar}>
          <Text style={styles.bottomMeta}>{new Date().toLocaleDateString("en-US")}</Text>
        </View>
      </Page>
    </Document>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const navy = "#0a3d72";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1f2937", fontFamily: "Helvetica" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    height: 60,
  },
  logo: { width: 180, height: 50, objectFit: "contain" },

  hero: { backgroundColor: navy, color: "#fff", padding: 22, marginBottom: 18 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 10 },
  heroBody: { color: "#dbeafe", fontSize: 10, lineHeight: 1.55 },

  detailsGrid: { flexDirection: "row", gap: 28, marginBottom: 18 },
  col: { flex: 1 },
  sectionHeader: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 },

  detail: { marginBottom: 12 },
  detailLabel: { fontSize: 10, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  detailValue: { fontSize: 11, color: "#1f2937" },

  notesBlock: { marginTop: 4, marginBottom: 14 },
  notesText: { fontSize: 11, color: "#1f2937", lineHeight: 1.4 },

  beneBlock: { marginTop: 4, marginBottom: 14 },
  beneRow: { marginBottom: 8 },
  beneName: { fontSize: 11, fontWeight: 700, color: "#0f172a" },
  beneContact: { fontSize: 10, color: "#475569", marginTop: 1 },

  divider: { height: 1, backgroundColor: "#0f172a", marginVertical: 12 },

  supportHeadline: { fontSize: 14, fontWeight: 700, color: navy, marginBottom: 12 },
  supportStack: { flexDirection: "column", gap: 12, marginBottom: 18 },
  supportLabel: { fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  supportLine: { fontSize: 11, color: "#1f2937", marginTop: 2 },
  supportOrText: { fontSize: 12, fontStyle: "italic", color: "#64748b" },

  bottomBar: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  bottomMeta: { fontSize: 8, color: "#475569" },
});

export async function generatePolicyPromisePDF({
  client,
  agent,
}: {
  client: Client;
  agent: AgentInfo;
}) {
  const blob = await pdf(<PolicyPromiseDoc client={client} agent={agent} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (client.client_name || "Client").replace(/[^a-z0-9]+/gi, "_");
  a.href = url;
  a.download = `Policy_Promise_${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
