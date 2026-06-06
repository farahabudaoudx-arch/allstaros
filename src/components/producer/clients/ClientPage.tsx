"use client";

import Link from "next/link";
import { useState } from "react";
import type { Client } from "@/lib/clients/types";
import { ClientDepositsPanel } from "@/components/producer/clients/ClientDepositsPanel";
import type { AgentInfo } from "@/components/producer/clients/PolicyPromisePDF";

type Props = { clientId: string; initialClient: Client; agent: AgentInfo };

function fmtMoney(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return iso;
}

function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
}

export function ClientPage({ clientId, initialClient, agent }: Props) {
  const client = initialClient;
  const [downloading, setDownloading] = useState(false);

  async function downloadPolicyPDF() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { generatePolicyPromisePDF } = await import(
        "@/components/producer/clients/PolicyPromisePDF"
      );
      await generatePolicyPromisePDF({ client, agent });
    } finally {
      setDownloading(false);
    }
  }

  const idx = client.chosen_quote_index ?? 0;
  const quote = client.quotes?.[idx];
  const coverage = quote?.coverage ? fmtMoney(quote.coverage) : "—";
  const carrier = quote?.carrier || "—";
  const monthly = quote?.premium ? fmtMoney(quote.premium) : "—";
  const annual = fmtMoney(client.annual_premium);

  return (
    <div className="ll-analytics space-y-7 pt-2">
      {/* Top breadcrumb */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Link href="/producer/clients" className="btn btn-pill text-xs">← All clients</Link>
      </div>

      {/* Title + actions — avatar + name on one line, then action buttons
          directly underneath. */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="avatar flex-shrink-0" style={{ width: 56, height: 56, fontSize: "1.05rem" }}>
            {initials(client.client_name)}
          </div>
          <h1 className="display-big text-white leading-[1.05] min-w-0">
            {client.client_name || "Unnamed"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/producer/clients/${clientId}/edit`} className="hbtn">
            <PencilIcon />
            <span>Edit</span>
          </Link>
          <button
            type="button"
            onClick={downloadPolicyPDF}
            disabled={downloading}
            className="hbtn disabled:opacity-60"
          >
            <PdfIcon />
            <span>{downloading ? "Preparing…" : "Policy PDF"}</span>
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="hero-stat">
            <div className="hero-stat-label">Annual premium</div>
            <div className="hero-stat-value tnum">{annual}</div>
            <div className="hero-stat-sub">paid yearly</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Monthly premium</div>
            <div className="hero-stat-value tnum">{monthly}</div>
            <div className="hero-stat-sub">
              {client.monthly_payment_date ? `Drafts ${client.monthly_payment_date}` : "—"}
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Coverage</div>
            <div className="hero-stat-value tnum">{coverage}</div>
            <div className="hero-stat-sub">{quote?.policy_type ?? "Final Expense"}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Carrier</div>
            <div className="hero-stat-value" style={{ fontSize: "1.5rem" }}>{carrier}</div>
            <div className="hero-stat-sub">{client.policy_number ? `Policy ${client.policy_number}` : "Policy # pending"}</div>
          </div>
        </div>
      </section>

      {/* Deposits tracker — sits between policy KPIs and the static detail
          sections so the agent sees the "next deposit" at a glance. */}
      <ClientDepositsPanel client={client} />

      {/* Detail sections — mirror the edit form: client info, medical notes,
          policy. */}
      <div className="space-y-5">
        <Section title="Client information">
          <DetailGrid
            items={[
              ["Phone", client.phone],
              ["Email", client.email],
              ["Address", client.address],
              ["City / State / Zip", [client.city, client.state, client.postal_code].filter(Boolean).join(", ") || null],
            ]}
          />
        </Section>

        <Section title="Medical notes">
          <DetailGrid
            items={[
              ["Date of birth", fmtDate(client.dob)],
              ["Age", client.age != null ? String(client.age) : null],
              ["Height / Weight", client.height_weight],
              ["Smoker", client.smoker ? "Yes" : "No"],
            ]}
          />
          <div className="mt-3">
            {client.medical_notes?.trim() ? (
              <div
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--ink-1)", lineHeight: 1.55 }}
              >
                {client.medical_notes}
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--ink-3)" }}>
                No medical notes recorded.
              </div>
            )}
          </div>
        </Section>

        <Section title="Policy">
          <DetailGrid
            items={[
              ["Carrier", quote?.carrier ?? null],
              ["Product type", quote?.policy_type ?? null],
              ["Coverage", quote?.coverage ? fmtMoney(quote.coverage) : null],
              ["Monthly premium", quote?.premium ? fmtMoney(quote.premium) : null],
              ["Policy #", client.policy_number],
              ["Payor", client.payor_name || client.client_name],
              ["Written on", fmtDate(client.submit_date)],
              ["Issued on", fmtDate(client.issue_date)],
              ["Monthly payment date", client.monthly_payment_date],
              ["Notes / Riders", client.policy_notes],
            ]}
          />
        </Section>

        <Section title="Beneficiaries">
          {client.beneficiaries?.length ? (
            <div className="flex flex-col gap-4">
              {client.beneficiaries.map((b, i) => (
                <div
                  key={i}
                  className={i > 0 ? "pt-4" : undefined}
                  style={i > 0 ? { borderTop: "1px solid var(--line-2)" } : undefined}
                >
                  <DetailGrid
                    items={[
                      ["Name", b.name],
                      ["Relationship", b.relationship],
                      ["Email", b.email],
                      ["Phone", b.phone],
                    ]}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm" style={{ color: "var(--ink-3)" }}>
              No beneficiaries recorded.
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display text-base text-white leading-none mb-3">{title}</h2>
      <div className="card p-5">{children}</div>
    </section>
  );
}

function DetailGrid({ items }: { items: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>{k}</dt>
          <dd className="text-white mt-1.5 break-words leading-snug">
            {v || <span style={{ color: "var(--ink-3)" }}>—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <path d="M14 2v6h6"></path>
      <path d="M12 18v-6"></path>
      <path d="M9 15l3 3 3-3"></path>
    </svg>
  );
}
