"use client";

import { useState } from "react";
import { PageHeader } from "@/components/producer/PageHeader";
import { UnderwritingWizard, type WizardVitals } from "@/components/underwriting/UnderwritingWizard";
import type { CarrierPortal } from "@/lib/carrier-portals";

export function UnderwritingClient({ carrierPortals }: { carrierPortals: CarrierPortal[] }) {
  const [notes, setNotes] = useState("");
  const [vitals, setVitals] = useState<WizardVitals>({ dob: "", height: "", weight: "" });

  return (
    <div className="ll-analytics min-h-full" style={{ background: "var(--bg-inner)" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader title="Underwriting Wizard" backHref="/producer/menu/resources" />
        <UnderwritingWizard
          value={notes}
          onChange={setNotes}
          vitals={vitals}
          onVitalsChange={setVitals}
          carrierPortals={carrierPortals}
        />
      </div>
    </div>
  );
}
