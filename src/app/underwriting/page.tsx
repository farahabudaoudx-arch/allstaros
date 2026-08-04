"use client";

import { useState } from "react";
import { PageHeader } from "@/components/producer/PageHeader";
import { UnderwritingWizard, type WizardVitals } from "@/components/underwriting/UnderwritingWizard";

export default function UnderwritingPage() {
  const [notes, setNotes] = useState("");
  const [vitals, setVitals] = useState<WizardVitals>({ dob: "", height: "", weight: "" });
  return (
    // min-h-full, not 100vh: inside the app frame the page already sits below a
    // header, so a full-viewport minimum made every visit scrollable by exactly
    // the height of that header.
    <div className="ll-analytics min-h-full" style={{ background: "var(--bg-inner)" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader title="Underwriting Wizard" backHref="/producer/menu/resources" />
        <UnderwritingWizard
          value={notes}
          onChange={setNotes}
          vitals={vitals}
          onVitalsChange={setVitals}
        />
      </div>
    </div>
  );
}
