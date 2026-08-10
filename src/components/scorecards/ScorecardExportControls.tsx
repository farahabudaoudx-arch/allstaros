"use client";

import { toBlob } from "html-to-image";
import { useState } from "react";
import {
  SCORECARD_EXPORTS,
  scorecardExportFilename,
  type ScorecardExportFormat,
} from "@/lib/scorecards/export";

function DownloadGlyph({ format }: { format: ScorecardExportFormat }) {
  const portrait = format === "portrait";

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {portrait ? <rect x="6.5" y="2" width="11" height="20" rx="1" /> : <rect x="1.5" y="7" width="21" height="10" rx="1" />}
      <path d="M12 8.5v5" />
      <path d="m9.75 11.75 2.25 2.25 2.25-2.25" />
      <path d="M9.5 15.5h5" />
    </svg>
  );
}

async function exportSection(
  sectionId: string,
  sectionName: string,
  format: ScorecardExportFormat,
) {
  const source = document.getElementById(sectionId);
  if (!source) throw new Error(`Scorecard section not found: ${sectionId}`);

  const { width, height } = SCORECARD_EXPORTS[format];
  const stage = document.createElement("div");
  stage.className = "scorecard-export-stage";
  stage.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${width}px`,
    `height:${height}px`,
    "overflow:hidden",
    "z-index:-1",
  ].join(";");

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll("[data-export-controls]").forEach((node) => node.remove());
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.boxSizing = "border-box";

  const motionReset = document.createElement("style");
  motionReset.textContent = `
    .scorecard-export-stage *, .scorecard-export-stage *::before, .scorecard-export-stage *::after {
      animation: none !important;
      transition: none !important;
    }
  `;
  stage.append(motionReset, clone);
  document.body.append(stage);

  try {
    await document.fonts.ready;
    const blob = await toBlob(stage, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      cacheBust: true,
    });
    if (!blob) throw new Error("The scorecard PNG could not be created.");
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = scorecardExportFilename(sectionName, format);
    link.href = objectUrl;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  } finally {
    stage.remove();
  }
}

export function ScorecardExportControls({
  sectionId,
  sectionName,
}: {
  sectionId: string;
  sectionName: string;
}) {
  const [busyFormat, setBusyFormat] = useState<ScorecardExportFormat | null>(null);
  const [status, setStatus] = useState("");

  const download = async (format: ScorecardExportFormat) => {
    if (busyFormat) return;
    setBusyFormat(format);
    setStatus("");
    try {
      await exportSection(sectionId, sectionName, format);
      setStatus(`${SCORECARD_EXPORTS[format].label} PNG downloaded.`);
    } catch {
      setStatus("PNG download failed. Please try again.");
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div data-export-controls className="absolute right-5 top-5 z-10 flex gap-2 sm:right-8 sm:top-8">
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {(["portrait", "landscape"] as const).map((format) => {
        const label = SCORECARD_EXPORTS[format].label;
        const busy = busyFormat === format;
        return (
          <button
            key={format}
            type="button"
            onClick={() => void download(format)}
            disabled={busyFormat !== null}
            aria-label={`Download ${sectionName} as a ${label} PNG`}
            title={`Download ${label} PNG`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-card text-ink transition-[transform,border-color,opacity] duration-150 ease-out active:scale-[0.97] disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-subtle border-t-ink" aria-hidden="true" />
            ) : (
              <DownloadGlyph format={format} />
            )}
          </button>
        );
      })}
    </div>
  );
}
