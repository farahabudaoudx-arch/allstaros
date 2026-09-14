import "server-only";

import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

type HandoffDocumentData = {
  agencyName: string;
  productName: string;
  primaryContact: { name: string; email: string };
  osUrl: string;
  vercelProjectRef: string;
  supabaseProjectRef: string;
  initialAdminEmail: string;
  installedSourceSha: string;
  schemaRelease: string;
  handoffAt: string | null;
  reviewDeadline: string | null;
  defectDeadline: string | null;
  maintenance: { status: string; monthlyPriceUsd: number | null };
  operatingNotes: string[];
};

const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 10, lineHeight: 1.45, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#4B5563", marginBottom: 20 },
  section: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#D1D5DB" },
  heading: { fontSize: 13, fontWeight: 700, marginBottom: 7 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 130, color: "#6B7280" },
  value: { flex: 1 },
  note: { marginBottom: 5 },
  footer: { marginTop: 20, fontSize: 8, color: "#6B7280" },
});

function HandoffDoc({ data }: { data: HandoffDocumentData }) {
  const maintenance = data.maintenance.status === "selected"
    ? "Selected — $197/month from handoff"
    : "Declined";
  return (
    <Document title={`${data.productName} handoff`} author="OS Assembly Line">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{data.productName} — OS Handoff</Text>
        <Text style={styles.subtitle}>{data.agencyName}</Text>
        <View style={styles.section}>
          <Text style={styles.heading}>Installation</Text>
          <View style={styles.row}><Text style={styles.label}>OS URL</Text><Text style={styles.value}>{data.osUrl}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Vercel project</Text><Text style={styles.value}>{data.vercelProjectRef}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Supabase project</Text><Text style={styles.value}>{data.supabaseProjectRef}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Initial admin</Text><Text style={styles.value}>{data.initialAdminEmail}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Source SHA</Text><Text style={styles.value}>{data.installedSourceSha}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Schema release</Text><Text style={styles.value}>{data.schemaRelease}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>Handoff and support windows</Text>
          <View style={styles.row}><Text style={styles.label}>Handoff at</Text><Text style={styles.value}>{data.handoffAt ?? "Starts when delivery is finalized"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Review deadline</Text><Text style={styles.value}>{data.reviewDeadline ? `${data.reviewDeadline} (5 business days)` : "Calculated when delivery is finalized"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Defect deadline</Text><Text style={styles.value}>{data.defectDeadline ? `${data.defectDeadline} (90 days)` : "Calculated when delivery is finalized"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Maintenance</Text><Text style={styles.value}>{maintenance}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>Primary contact</Text>
          <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{data.primaryContact.name}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{data.primaryContact.email}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>Operating notes</Text>
          {data.operatingNotes.map((note) => <Text key={note} style={styles.note}>• {note}</Text>)}
        </View>
        <Text style={styles.footer}>No passwords, API keys, tokens, or provider credentials are included in this document.</Text>
      </Page>
    </Document>
  );
}

export async function renderWhitelabelHandoffPdf(data: HandoffDocumentData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<HandoffDoc data={data} />);
  return new Uint8Array(buffer);
}
