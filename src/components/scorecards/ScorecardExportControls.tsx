"use client";

import { toBlob } from "html-to-image";
import { useState } from "react";
import {
  PRODUCER_CARD_EXPORT_LAYOUT,
  SCORECARD_EXPORTS,
  SCORECARD_EXPORT_PIXEL_RATIO,
  scorecardExportFilename,
  type ScorecardExportFormat,
} from "@/lib/scorecards/export";

type ScorecardExportMetadata = {
  cardType: "producer" | "builder";
  memberName: string;
  periodLabel: string;
};

function applyBaseballCardExportLayout(
  clone: HTMLElement,
  content: HTMLElement,
  format: ScorecardExportFormat,
) {
  const layout = PRODUCER_CARD_EXPORT_LAYOUT[format];
  const heading = content.firstElementChild as HTMLElement | null;
  const cardSlot = content.children.item(1) as HTMLElement | null;
  const card = content.querySelector<HTMLElement>(".producer-baseball-card");
  const flip = content.querySelector<HTMLElement>(".producer-baseball-card__flip");
  const inner = content.querySelector<HTMLElement>(".producer-baseball-card__inner");
  const front = content.querySelector<HTMLElement>(".producer-baseball-card__front");
  const back = content.querySelector<HTMLElement>(".producer-baseball-card__back");
  const hint = content.querySelector<HTMLElement>(".producer-baseball-card__hint");

  clone.style.padding = "0";
  clone.style.alignItems = "stretch";
  content.style.width = "100%";
  content.style.height = "100%";
  content.style.maxWidth = "none";
  content.style.margin = "0";
  content.style.position = "relative";
  content.style.textAlign = "initial";
  content.style.transform = "none";

  if (heading) heading.style.display = "none";
  if (cardSlot) {
    cardSlot.style.position = "absolute";
    cardSlot.style.inset = "0";
    cardSlot.style.width = "100%";
    cardSlot.style.height = "100%";
    cardSlot.style.maxWidth = "none";
    cardSlot.style.margin = "0";
  }
  if (card) {
    card.style.position = "absolute";
    card.style.inset = "0";
    card.style.width = "100%";
    card.style.height = "100%";
    card.style.maxWidth = "none";
    card.style.margin = "0";
  }
  if (flip) {
    flip.style.position = "static";
    flip.style.width = "100%";
    flip.style.height = "100%";
    flip.style.aspectRatio = "auto";
    flip.style.perspective = "none";
  }
  if (inner) {
    inner.style.position = "static";
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.transform = "none";
    inner.style.transformStyle = "flat";
  }
  if (hint) hint.style.display = "none";

  for (const [face, faceLayout, zIndex] of [
    [front, layout.front, "1"],
    [back, layout.back, "2"],
  ] as const) {
    if (!face) continue;
    face.style.position = "absolute";
    face.style.left = `${faceLayout.left}px`;
    face.style.top = `${faceLayout.top}px`;
    face.style.right = "auto";
    face.style.bottom = "auto";
    face.style.width = `${faceLayout.width}px`;
    face.style.height = `${faceLayout.height}px`;
    face.style.transform = "none";
    face.style.backfaceVisibility = "visible";
    face.style.zIndex = zIndex;
  }
}

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

async function waitForExportImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    await Promise.race([
      image.decode().catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5_000)),
    ]);
  }));
}

async function renderSectionPng(
  sectionId: string,
  format: ScorecardExportFormat,
  metadata: ScorecardExportMetadata,
): Promise<Blob> {
  const source = document.getElementById(sectionId);
  if (!source) throw new Error(`Scorecard section not found: ${sectionId}`);

  const { width, height } = SCORECARD_EXPORTS[format];
  const isBaseballCardExport = (
    sectionId === "scorecard-section-card" || sectionId === "builder-scorecard-section-card"
  ) && source.querySelector(".producer-baseball-card") != null;
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
  clone.querySelectorAll("[data-export-controls], [data-export-exclude]").forEach((node) => node.remove());
  clone.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    details.open = true;
  });
  clone.style.position = "absolute";
  clone.style.inset = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.boxSizing = "border-box";
  clone.style.display = "flex";
  clone.style.alignItems = "center";
  clone.style.border = "0";
  clone.style.padding = format === "portrait" ? "120px 64px 160px" : "130px 96px 140px";

  const content = clone.firstElementChild as HTMLElement | null;
  if (content) {
    content.style.width = "100%";
    content.style.maxWidth = format === "portrait" ? "952px" : "1696px";
    content.style.margin = "0 auto";
    content.style.textAlign = "center";
    content.style.transform = format === "portrait" ? "none" : "scale(.84)";
    content.style.transformOrigin = "center";
    const sectionNumber = content.querySelector(":scope > div:first-child > p:first-child") as HTMLElement | null;
    if (sectionNumber) {
      sectionNumber.style.display = "none";
      if (sectionNumber.parentElement) sectionNumber.parentElement.style.justifyContent = "center";
    }
    if (format === "portrait") {
      const heading = content.querySelector("h3") as HTMLElement | null;
      if (heading) {
        heading.style.fontSize = "72px";
        heading.style.lineHeight = "1";
      }
      content.querySelectorAll<HTMLElement>(".italic").forEach((element) => {
        element.style.fontSize = "26px";
        element.style.lineHeight = "1.35";
      });
      content.querySelectorAll<HTMLElement>(".tabular-nums").forEach((element) => {
        if (String(element.className).includes("text-[clamp")) {
          element.style.fontSize = "140px";
          element.style.lineHeight = ".9";
        }
      });
    }
    content.querySelectorAll<HTMLElement>(".max-w-2xl, .max-w-3xl, .max-w-4xl, .max-w-5xl, .max-w-sm").forEach((element) => {
      element.style.marginLeft = "auto";
      element.style.marginRight = "auto";
    });
    if (isBaseballCardExport) applyBaseballCardExportLayout(clone, content, format);
  }
  if (format === "landscape") {
    clone.querySelectorAll<HTMLElement>(".max-w-3xl, .max-w-4xl, .max-w-5xl").forEach((element) => {
      element.style.maxWidth = "none";
    });
  }

  const artboard = document.createElement("div");
  artboard.style.cssText = [
    "position:relative",
    `width:${width}px`,
    `height:${height}px`,
    "overflow:hidden",
    "box-sizing:border-box",
    "background:#050505",
    "color:#f7f7f7",
  ].join(";");

  const attribution = document.createElement("p");
  attribution.textContent = `${metadata.memberName} · ${metadata.periodLabel} · ${metadata.cardType === "producer" ? "Producer" : "Builder"} Scorecard`;
  attribution.style.cssText = [
    "position:absolute",
    format === "portrait" ? "left:80px;right:80px;bottom:76px" : "left:112px;right:112px;bottom:60px",
    "margin:0",
    `font-size:${format === "portrait" ? "24px" : "20px"}`,
    "line-height:1.4",
    "font-weight:600",
    "color:rgba(247,247,247,.72)",
    "text-align:center",
    "overflow-wrap:anywhere",
    "z-index:3",
  ].join(";");

  const brandLogo = format === "portrait" && !isBaseballCardExport ? document.createElement("img") : null;
  if (brandLogo) {
    brandLogo.src = "/logo.png";
    brandLogo.alt = "";
    brandLogo.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:220px",
      "width:180px",
      "height:auto",
      "transform:translateX(-50%)",
      "opacity:.92",
      "z-index:3",
    ].join(";");
  }

  const motionReset = document.createElement("style");
  motionReset.textContent = `
    .scorecard-export-stage *, .scorecard-export-stage *::before, .scorecard-export-stage *::after {
      animation: none !important;
      transition: none !important;
    }
    .scorecard-export-stage [data-scorecard-stars] { display: inline-flex !important; }
    .scorecard-export-stage .weekly-trend__bars { row-gap: 22px !important; }
    .scorecard-export-stage .weekly-trend__bar-row {
      grid-template-columns: 150px minmax(0, 1fr) 125px !important;
      column-gap: 24px !important;
    }
    .scorecard-export-stage .weekly-trend__bar-label,
    .scorecard-export-stage .weekly-trend__bar-value { font-size: 20px !important; }
    .scorecard-export-stage .weekly-trend__bar-track { height: 18px !important; }
    .scorecard-export-stage .scorecard-copy,
    .scorecard-export-stage .activity-story-lines { text-align: center !important; }
    .scorecard-export-stage .scorecard-copy,
    .scorecard-export-stage .activity-story-lines,
    .scorecard-export-stage .organization-grid,
    .scorecard-export-stage .growth-table,
    .scorecard-export-stage .tracking-story { margin-left: auto !important; margin-right: auto !important; }
    .scorecard-export-stage .organization-card,
    .scorecard-export-stage .growth-header-cell,
    .scorecard-export-stage .growth-cell { text-align: center !important; }
    .scorecard-export-stage .organization-card-label { font-size: ${format === "portrait" ? "22px" : "20px"} !important; }
    .scorecard-export-stage .organization-card-value { font-size: ${format === "portrait" ? "34px" : "32px"} !important; }
    .scorecard-export-stage .organization-card-rank { font-size: ${format === "portrait" ? "22px" : "20px"} !important; }
    .scorecard-export-stage .producer-numbers-grid {
      display: flex !important;
      flex-wrap: wrap !important;
      justify-content: center !important;
    }
    .scorecard-export-stage .producer-number-card {
      width: ${format === "portrait" ? "calc(50% - 6px)" : "calc(25% - 9px)"} !important;
      text-align: left !important;
    }
    .scorecard-export-stage .producer-number-card__label { font-size: ${format === "portrait" ? "22px" : "20px"} !important; }
    .scorecard-export-stage .producer-number-card__value { font-size: ${format === "portrait" ? "40px" : "36px"} !important; }
    .scorecard-export-stage .producer-number-card__percentile,
    .scorecard-export-stage .tracking-percentile { font-size: ${format === "portrait" ? "22px" : "20px"} !important; }
    .scorecard-export-stage .activity-story-lines {
      font-size: ${format === "portrait" ? "28px" : "26px"} !important;
      line-height: 1.5 !important;
    }
    .scorecard-export-stage .growth-export-mobile { display: none !important; }
    .scorecard-export-stage .growth-export-desktop-header {
      display: grid !important;
      grid-template-columns: 3fr 3fr 2fr !important;
    }
    .scorecard-export-stage .growth-row {
      display: grid !important;
      grid-template-columns: 3fr 3fr 2fr !important;
    }
    .scorecard-export-stage .growth-export-desktop { display: block !important; }
    .scorecard-export-stage .growth-header-cell,
    .scorecard-export-stage .growth-title { font-size: 22px !important; }
    .scorecard-export-stage .growth-value { font-size: 32px !important; }
    .scorecard-export-stage .tracking-story { text-align: center !important; }
    .scorecard-export-stage .tracking-head {
      align-items: center !important;
      flex-direction: column !important;
      justify-content: center !important;
    }
    .scorecard-export-stage .tracking-summary { font-size: 30px !important; }
    .scorecard-export-stage .tracking-legend {
      font-size: 24px !important;
      justify-content: center !important;
    }
    ${format === "portrait" ? `
      .scorecard-export-stage .scorecard-intro {
        max-width: none !important;
        white-space: nowrap !important;
      }
    ` : `
      .scorecard-export-stage .scorecard-copy { font-size: 24px !important; line-height: 1.4 !important; }
      .scorecard-export-stage .growth-header-cell { padding-top: 10px !important; padding-bottom: 10px !important; }
      .scorecard-export-stage .growth-cell { padding-top: 10px !important; padding-bottom: 10px !important; }
    `}
    ${sectionId === "scorecard-section-02" ? `
      .scorecard-export-stage .organization-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
    ` : ""}
    ${isBaseballCardExport ? `
      .scorecard-export-stage .producer-baseball-card__front > span,
      .scorecard-export-stage .producer-baseball-card__back > span {
        margin: ${format === "portrait" ? "12px" : "9px"} !important;
      }
      .scorecard-export-stage .producer-baseball-card__front span.absolute.inset-x-0.bottom-0 > img {
        height: ${format === "portrait" ? "48px" : "38px"} !important;
      }
      .scorecard-export-stage .producer-baseball-card__front span.absolute.inset-x-0.bottom-0 > span:nth-of-type(1) {
        font-size: ${format === "portrait" ? "36px" : "28px"} !important;
      }
      .scorecard-export-stage .producer-baseball-card__front span.absolute.inset-x-0.bottom-0 > span:nth-of-type(2) {
        font-size: ${format === "portrait" ? "18px" : "15px"} !important;
      }
      .scorecard-export-stage .producer-baseball-card__back > span > span:nth-child(2) > span:first-child {
        font-size: ${format === "portrait" ? "82px" : "64px"} !important;
      }
      .scorecard-export-stage .producer-baseball-card__back > span > span:nth-child(3) > span {
        padding-top: ${format === "portrait" ? "14px" : "11px"} !important;
        padding-bottom: ${format === "portrait" ? "14px" : "11px"} !important;
      }
    ` : ""}
  `;
  artboard.append(clone);
  if (!isBaseballCardExport) artboard.append(attribution);
  if (brandLogo) artboard.append(brandLogo);
  stage.append(motionReset, artboard);
  document.body.append(stage);

  try {
    await document.fonts.ready;
    await waitForExportImages(artboard);
    const blob = await toBlob(artboard, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: SCORECARD_EXPORT_PIXEL_RATIO,
      skipAutoScale: true,
      cacheBust: true,
    });
    if (!blob) throw new Error("The scorecard PNG could not be created.");
    return blob;
  } finally {
    stage.remove();
  }
}

function submitPngDownload(filename: string, dataUrl: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/preview/scorecards/export-png";
  form.hidden = true;

  for (const [name, value] of [["filename", filename], ["png", dataUrl]]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(form);
  form.requestSubmit();
  window.setTimeout(() => form.remove(), 1_000);
}

export function ScorecardExportControls({
  sectionId,
  sectionName,
  cardType,
  memberName,
  periodLabel,
}: {
  sectionId: string;
  sectionName: string;
} & ScorecardExportMetadata) {
  const [busyFormat, setBusyFormat] = useState<ScorecardExportFormat | null>(null);
  const [status, setStatus] = useState("");
  const [readyDownload, setReadyDownload] = useState<{
    format: ScorecardExportFormat;
    filename: string;
    dataUrl: string;
  } | null>(null);

  const download = async (format: ScorecardExportFormat) => {
    if (busyFormat) return;
    setBusyFormat(format);
    setStatus("");
    try {
      const metadata = { cardType, memberName, periodLabel, sectionName };
      const blob = await renderSectionPng(sectionId, format, metadata);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      setReadyDownload({
        format,
        filename: scorecardExportFilename(metadata, format),
        dataUrl,
      });
      submitPngDownload(scorecardExportFilename(metadata, format), dataUrl);
      setStatus(`${SCORECARD_EXPORTS[format].label} PNG download started.`);
    } catch {
      setStatus("PNG download failed. Please try again.");
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div data-export-controls className="relative z-10 mb-5 flex justify-end gap-2 sm:absolute sm:right-8 sm:top-8 sm:mb-0">
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {(["portrait", "landscape"] as const).map((format) => {
        const label = SCORECARD_EXPORTS[format].label;
        const busy = busyFormat === format;
        const ready = readyDownload?.format === format;
        if (ready) {
          return (
            <form key={format} action="/preview/scorecards/export-png" method="post">
              <input type="hidden" name="filename" value={readyDownload.filename} />
              <input type="hidden" name="png" value={readyDownload.dataUrl} />
              <button
                type="submit"
                aria-label={`Download ${sectionName} as a ${label} PNG`}
                title={`Download ${label} PNG`}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-accent bg-accent/15 text-accent transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                <DownloadGlyph format={format} />
              </button>
            </form>
          );
        }
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
