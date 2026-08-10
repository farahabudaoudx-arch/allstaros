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

async function renderSectionPng(
  sectionId: string,
  format: ScorecardExportFormat,
): Promise<Blob> {
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
    content.style.transform = format === "portrait" ? "none" : "scale(.84)";
    content.style.transformOrigin = "center";
    const sectionNumber = content.querySelector(":scope > div:first-child > p:first-child") as HTMLElement | null;
    if (sectionNumber) sectionNumber.style.display = "none";
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
  }
  if (format === "landscape") {
    clone.querySelectorAll<HTMLElement>(".max-w-3xl, .max-w-4xl, .max-w-5xl").forEach((element) => {
      element.style.maxWidth = "none";
    });
  }

  const trend = clone.querySelector(".weekly-trend");
  const trendSvg = trend?.querySelector("svg");
  if (trend && trendSvg) {
    const baseline = trendSvg.querySelector(":scope > line");
    const area = trendSvg.querySelector("polygon");
    const line = trendSvg.querySelector("polyline");
    baseline?.setAttribute("stroke", "rgba(247,247,247,.46)");
    area?.setAttribute("fill", "#f6c945");
    area?.setAttribute("fill-opacity", ".16");
    line?.setAttribute("stroke", "#f6c945");
    line?.setAttribute("stroke-dasharray", "none");
    line?.setAttribute("stroke-dashoffset", "0");
    trendSvg.querySelectorAll("circle").forEach((circle) => circle.setAttribute("fill", "#f6c945"));
    if (format === "portrait") {
      (trend as HTMLElement).style.marginTop = "48px";
      trendSvg.setAttribute("preserveAspectRatio", "none");
      trendSvg.style.width = "100%";
      trendSvg.style.height = "340px";
      line?.setAttribute("stroke-width", "6");
      trendSvg.querySelectorAll("circle").forEach((circle) => circle.setAttribute("r", "8"));
    }
    const chartWrap = document.createElement("div");
    chartWrap.style.cssText = format === "portrait"
      ? "position:relative;width:100%;height:340px;overflow:visible;"
      : "position:relative;width:100%;overflow:visible;";
    trendSvg.replaceWith(chartWrap);
    chartWrap.append(trendSvg);

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    const pointGroups = trendSvg.querySelectorAll("g.weekly-trend__point");
    pointGroups.forEach((group) => {
      const circle = group.querySelector("circle");
      const text = group.querySelector("text")?.textContent?.trim();
      if (!circle || !text) return;
      const x = Number(circle.getAttribute("cx"));
      const y = Number(circle.getAttribute("cy"));
      const value = document.createElement("span");
      value.textContent = text;
      value.style.cssText = [
        "position:absolute",
        `left:${(x / 1000) * 100}%`,
        `top:${Math.max(0, ((y - 64) / 245) * 100)}%`,
        "transform:translateX(-50%)",
        `min-width:${format === "portrait" ? "140px" : "112px"}`,
        `padding:${format === "portrait" ? "11px 16px" : "8px 12px"}`,
        "border:1px solid rgba(255,255,255,.18)",
        "background:#111214",
        "color:#f7f7f7",
        `font-size:${format === "portrait" ? "22px" : "17px"}`,
        "font-weight:650",
        "line-height:1.2",
        "text-align:center",
        "border-radius:9px",
        "box-sizing:border-box",
      ].join(";");
      overlay.append(value);
      group.querySelectorAll("rect,path,text").forEach((node) => node.remove());
    });

    trendSvg.querySelectorAll("g:not(.weekly-trend__point)").forEach((group) => {
      const label = group.querySelector("text")?.textContent?.trim();
      const tick = group.querySelector("line");
      if (!label || !tick) return;
      const x = Number(tick.getAttribute("x1"));
      const axisLabel = document.createElement("span");
      axisLabel.textContent = label;
      axisLabel.style.cssText = [
        "position:absolute",
        `left:${(x / 1000) * 100}%`,
        `top:${format === "portrait" ? "86%" : "88%"}`,
        "transform:translateX(-50%)",
        "color:rgba(247,247,247,.62)",
        `font-size:${format === "portrait" ? "20px" : "14px"}`,
        "font-weight:500",
        "white-space:nowrap",
      ].join(";");
      overlay.append(axisLabel);
      group.querySelector("text")?.remove();
    });
    chartWrap.append(overlay);
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
  const producer = document.getElementById("producer-scorecard-title")?.textContent?.trim();
  const scorecardTitle = document.getElementById("producer-scorecard-title")?.nextElementSibling?.textContent?.trim();
  const period = scorecardTitle?.replace(/ Producer Scorecard$/, "");
  attribution.textContent = [producer, period].filter(Boolean).join(" · ");
  attribution.style.cssText = [
    "position:absolute",
    format === "portrait" ? "left:80px;right:80px;bottom:76px" : "left:112px;right:112px;bottom:60px",
    "margin:0",
    `font-size:${format === "portrait" ? "24px" : "20px"}`,
    "line-height:1.4",
    "font-weight:600",
    "color:rgba(247,247,247,.72)",
    "text-align:center",
    "z-index:3",
  ].join(";");

  const motionReset = document.createElement("style");
  motionReset.textContent = `
    .scorecard-export-stage *, .scorecard-export-stage *::before, .scorecard-export-stage *::after {
      animation: none !important;
      transition: none !important;
    }
    .scorecard-export-stage .weekly-trend__point {
      opacity: 1 !important;
      transform: none !important;
    }
    .scorecard-export-stage .weekly-trend__line {
      stroke-dashoffset: 0 !important;
    }
  `;
  artboard.append(clone, attribution);
  stage.append(motionReset, artboard);
  document.body.append(stage);

  try {
    await document.fonts.ready;
    const blob = await toBlob(artboard, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
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
}: {
  sectionId: string;
  sectionName: string;
}) {
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
      const blob = await renderSectionPng(sectionId, format);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      setReadyDownload({
        format,
        filename: scorecardExportFilename(sectionName, format),
        dataUrl,
      });
      submitPngDownload(scorecardExportFilename(sectionName, format), dataUrl);
      setStatus(`${SCORECARD_EXPORTS[format].label} PNG download started.`);
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
        const ready = readyDownload?.format === format;
        if (ready) {
          const formId = `${sectionId}-${format}-download`;
          return (
            <form
              key={format}
              id={formId}
              action="/preview/scorecards/export-png"
              method="post"
            >
              <input type="hidden" name="filename" value={readyDownload.filename} />
              <input type="hidden" name="png" value={readyDownload.dataUrl} />
              <button
                type="submit"
                aria-label={`Save ${sectionName} as a ${label} PNG`}
                title="PNG ready — click to save"
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
      {readyDownload ? (
        <button
          type="submit"
          form={`${sectionId}-${readyDownload.format}-download`}
          className="absolute right-0 top-12 whitespace-nowrap pt-2 text-xs font-medium text-accent underline underline-offset-4"
        >
          PNG ready — click to save
        </button>
      ) : null}
    </div>
  );
}
