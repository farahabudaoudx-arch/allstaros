import { buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/producer/PageHeader";

type Script = {
  /** Short vertical label shown as the card title (Vets / IUL / FEX). */
  label: string;
  /** Full name of the script so producers know what they are grabbing. */
  title: string;
  description: string;
  /** Basename in /public/scripts (without extension). */
  file: string;
  /** Friendly filename the browser saves the download as. */
  downloadName: string;
};

const SCRIPTS: Script[] = [
  {
    label: "Vets",
    title: "Veteran Call Script",
    description: "Word-for-word veteran final expense script.",
    file: "vets-call-script",
    downloadName: "Veteran Call Script",
  },
  {
    label: "IUL",
    title: "Trucker IUL Script",
    description: "The Billion Dollar Trucker IUL phone script.",
    file: "iul-trucker-script",
    downloadName: "Billion Dollar Trucker IUL Script",
  },
  {
    label: "FEX",
    title: "FEX Script",
    description: "Our proven final expense phone script.",
    file: "fex-billion-dollar-script",
    downloadName: "FEX Script",
  },
];

function DownloadButton({ href, download, kind }: { href: string; download: string; kind: string }) {
  return (
    <a
      href={href}
      download={download}
      className={buttonClass("secondary", "flex-1 justify-center gap-2")}
    >
      <DownloadIcon className="h-4 w-4" />
      {kind}
    </a>
  );
}

export default function ScriptsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title="Scripts" backHref="/producer/menu/resources" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCRIPTS.map((s) => (
          <div
            key={s.file}
            className="flex flex-col rounded-2xl border border-hairline bg-card p-5"
          >
            <span className="text-xs uppercase tracking-[0.18em] text-accent">
              {s.label}
            </span>
            <h2 className="mt-2 text-base font-semibold text-ink">{s.title}</h2>
            <p className="mt-1.5 text-sm text-subtle">{s.description}</p>

            <div className="mt-5 flex gap-2.5">
              <DownloadButton
                href={`/scripts/${s.file}.pdf`}
                download={`${s.downloadName}.pdf`}
                kind="PDF"
              />
              <DownloadButton
                href={`/scripts/${s.file}.docx`}
                download={`${s.downloadName}.docx`}
                kind="DOCX"
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// Download — tray with a down arrow (lucide: download)
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}
