"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { inviteTeamBatch } from "@/lib/actions/recruits";
import {
  MAX_BATCH_INVITES,
  type BatchInviteRow,
  type InviteRole,
} from "@/lib/invite/batch";
import { parseInviteRows } from "@/lib/invite/parse-roster";
import { Input, Button, Spinner } from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "recruit", label: "Recruit — no license" },
  { value: "producer", label: "Producer — licensed" },
  { value: "builder", label: "Builder — licensed, runs a team" },
];

const ROLE_SHORT: Record<InviteRole, string> = {
  recruit: "Recruit",
  producer: "Producer",
  builder: "Builder",
};

type Row = { key: string; email: string; role: InviteRole; error?: string };

let rowSeq = 0;
function blankRow(role: InviteRole = "recruit"): Row {
  rowSeq += 1;
  return { key: `r${rowSeq}`, email: "", role };
}

function isValid(row: Row): boolean {
  return EMAIL_RE.test(row.email.trim().toLowerCase());
}

/**
 * Add people to your team, on both the Recruiting and My Downline pages.
 * Collapsed to a "+" trigger until opened. Each row is an email plus a role —
 * Recruit (no license, enters the pipeline), Producer (licensed, skips it), or
 * Builder (licensed and runs their own downline). Add as many rows as you like,
 * or import a CSV that carries the role. Sends the good ones and reports the
 * rest; only failed rows stay behind for fix-and-resend.
 */
export function AddPerson({
  triggerLabel = "Add someone to my downline",
  defaultOpen = false,
  defaultRole = "recruit",
}: {
  triggerLabel?: string;
  /** Opens the form on mount — used by the "Add Team Member"/"Add Recruit"
   *  menu tiles, which deep-link here with `?add=1`. */
  defaultOpen?: boolean;
  /** Role each new row starts on. */
  defaultRole?: InviteRole;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/[0.05] p-5">
      {/* The yellow "+" is the toggle — it rotates 45° into an "×" when open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-2xl leading-none text-black">
          <span
            className={`transition-transform duration-200 ease-out ${
              open ? "rotate-45" : ""
            }`}
          >
            +
          </span>
        </span>
        <span className="text-sm font-semibold text-ink">{triggerLabel}</span>
      </button>

      {open ? (
        <div className="mt-5">
          <InvitePeopleForm defaultRole={defaultRole} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The invite rows themselves, with no chrome around them. Shared by the inline
 * `AddPerson` box on Recruiting/My Downline and by `AddPeopleModal`, the popup
 * the "Add Recruit"/"Add Team Member" menu tiles open — same roles, same CSV
 * import, same validation, so there is only ever one invite flow to maintain.
 */
export function InvitePeopleForm({
  defaultRole = "recruit",
  onSent,
}: {
  defaultRole?: InviteRole;
  /** Fired after a batch where at least one invite went out. */
  onSent?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blankRow(defaultRole)]);
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [summary, setSummary] = useState<{ sent: number; failed: number } | null>(
    null,
  );

  const readyRows = rows.filter(isValid);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)),
    );
    if (summary) setSummary(null);
    if (error) setError("");
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow(defaultRole)]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [blankRow(defaultRole)];
    });
  }

  function importRows(csv: string) {
    const parsed = parseInviteRows(csv);
    if (parsed.length === 0) {
      setError("Couldn't find any emails in that file.");
      return;
    }
    setError("");
    setSummary(null);
    setRows((prev) => {
      const base =
        prev.length === 1 && !prev[0].email.trim() ? [] : prev;
      const added: Row[] = parsed.map((p) => {
        rowSeq += 1;
        return { key: `r${rowSeq}`, email: p.email, role: p.role };
      });
      return [...base, ...added];
    });
  }

  async function send() {
    if (readyRows.length === 0) {
      setError("Add at least one person with a valid email.");
      return;
    }
    if (readyRows.length > MAX_BATCH_INVITES) {
      setError(
        `That's ${readyRows.length} people. You can send up to ${MAX_BATCH_INVITES} at a time — remove ${readyRows.length - MAX_BATCH_INVITES} and send the rest in another batch.`,
      );
      return;
    }

    const licensed = readyRows.filter((r) => r.role !== "recruit");
    const ok = window.confirm(
      `Invite ${readyRows.length} ${readyRows.length === 1 ? "person" : "people"}?` +
        (licensed.length
          ? ` ${licensed.length} licensed (Producer/Builder) will skip the recruiting pipeline.`
          : "") +
        "\n\n" +
        readyRows
          .map((r) => `• ${r.email.trim()} — ${ROLE_SHORT[r.role]}`)
          .join("\n"),
    );
    if (!ok) return;

    setStatus("sending");
    setError("");
    const payload: BatchInviteRow[] = readyRows.map((r) => ({
      name: "",
      email: r.email.trim(),
      role: r.role,
    }));
    const res = await inviteTeamBatch(payload);
    setStatus("idle");

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const failedByKey = new Map<string, string>();
    let sent = 0;
    readyRows.forEach((r, i) => {
      const result = res.results[i];
      if (result.ok) sent += 1;
      else failedByKey.set(r.key, result.error ?? "Could not send.");
    });

    setRows((prev) => {
      const kept = prev
        .filter((r) => !(isValid(r) && !failedByKey.has(r.key)))
        .map((r) =>
          failedByKey.has(r.key)
            ? { ...r, error: failedByKey.get(r.key) }
            : { ...r, error: undefined },
        );
      return kept.length ? kept : [blankRow(defaultRole)];
    });
    setSummary({ sent, failed: failedByKey.size });
    router.refresh();
    if (sent > 0) onSent?.();
  }

  const sending = status === "sending";

  return (
    <div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                autoComplete="off"
                value={row.email}
                onChange={(e) => patchRow(row.key, { email: e.target.value })}
                disabled={sending}
                placeholder="Enter their email"
                className="flex-1"
              />
              <select
                value={row.role}
                onChange={(e) =>
                  patchRow(row.key, { role: e.target.value as InviteRole })
                }
                disabled={sending}
                aria-label="Role"
                className="shrink-0 rounded-xl border border-hairline bg-card px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={sending}
                  aria-label="Remove this person"
                  className="shrink-0 rounded-lg border border-hairline bg-card px-2.5 py-2 text-mute transition hover:border-neg/50 hover:text-neg disabled:opacity-50"
                >
                  ✕
                </button>
              ) : null}
            </div>
            {row.error ? (
              <p className="mt-1 pl-1 text-xs text-neg">{row.error}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={sending}
          className="flex items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-1.5 text-sm text-subtle transition hover:border-mute hover:text-ink disabled:opacity-50"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded bg-accent text-xs leading-none text-black">
            +
          </span>
          Add another
        </button>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          disabled={sending}
          className="rounded-lg border border-hairline bg-card px-3 py-1.5 text-sm text-subtle transition hover:border-mute hover:text-ink disabled:opacity-50"
        >
          Import CSV
        </button>
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="primary"
          onClick={send}
          disabled={sending}
          className="px-5 py-2.5"
        >
          {sending ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            `Send ${readyRows.length || ""} invite${readyRows.length === 1 ? "" : "s"}`.replace(
              "  ",
              " ",
            )
          )}
        </Button>
      </div>

      {summary ? (
        <p className="mt-3 text-sm text-pos">
          {summary.sent} invite{summary.sent === 1 ? "" : "s"} sent.
          {summary.failed > 0
            ? ` ${summary.failed} couldn't be sent — see the reason on each row and try again.`
            : ""}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-neg">{error}</p> : null}

      {showImport ? (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onFile={(csv) => {
            importRows(csv);
            setShowImport(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The same invite form in a centred popup, opened straight from the "Add
 * Recruit" and "Add Team Member" menu tiles so a builder never has to land on
 * the Recruiting or My Downline page first.
 */
export function AddPeopleModal({
  title,
  defaultRole = "recruit",
  onClose,
}: {
  title: string;
  defaultRole?: InviteRole;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-hairline bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-subtle">
              Enter an email and pick what they are. Recruits with no license
              enter the pipeline. Producers and Builders are already licensed and
              skip it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-hairline bg-card px-2.5 py-1.5 text-mute transition hover:border-mute hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-5">
          <InvitePeopleForm defaultRole={defaultRole} />
        </div>
      </div>
    </div>
  );
}

/** Explains the CSV format, then takes a file by drag-drop or click-to-browse. */
function CsvImportModal({
  onClose,
  onFile,
}: {
  onClose: () => void;
  onFile: (csv: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (
      !name.endsWith(".csv") &&
      file.type &&
      !file.type.includes("csv") &&
      !file.type.includes("text")
    ) {
      setFileError("That doesn't look like a CSV file. Pick a .csv file.");
      return;
    }
    const text = await file.text();
    onFile(text);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import a CSV"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-hairline bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">Import a CSV</h3>
        <p className="mt-1 text-sm text-subtle">
          One person per row. Put their email, and a role word —{" "}
          <span className="text-ink">recruit</span>,{" "}
          <span className="text-ink">producer</span>, or{" "}
          <span className="text-ink">builder</span>. No role defaults to recruit.
          A name and a header row are optional.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-card-hi px-3 py-2 text-xs text-subtle">
{`email,role
bob@example.com,recruit
jane@example.com,producer
lead@example.com,builder`}
        </pre>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition ${
            dragging
              ? "border-accent bg-accent/[0.06]"
              : "border-mute bg-card hover:border-accent/60"
          }`}
        >
          <span className="text-sm font-medium text-ink">
            Drop your CSV here, or click to choose
          </span>
          <span className="mt-1 text-xs text-mute">.csv files only</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            handleFile(file);
          }}
          className="hidden"
        />

        {fileError ? <p className="mt-2 text-sm text-neg">{fileError}</p> : null}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} className="px-4 py-2">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
