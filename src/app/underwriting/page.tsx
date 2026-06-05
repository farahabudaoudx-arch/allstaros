"use client";

import { useState } from "react";
import Link from "next/link";
import { UnderwritingWizard, type WizardVitals } from "@/components/underwriting/UnderwritingWizard";

export default function UnderwritingPage() {
  const [notes, setNotes] = useState("");
  const [vitals, setVitals] = useState<WizardVitals>({ dob: "", height: "", weight: "" });
  return (
    <div className="ll-analytics" style={{ background: "var(--bg-inner)", minHeight: "100vh" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/producer/resources" className="btn btn-pill mb-6 inline-flex text-xs">
          ← Resources
        </Link>
        <UnderwritingWizard
          value={notes}
          onChange={setNotes}
          vitals={vitals}
          onVitalsChange={setVitals}
          heading={
            <div>
              <h1 className="display-mega text-white leading-none">Underwriting Wizard</h1>
            </div>
          }
        />
      </div>
    </div>
  );
}
