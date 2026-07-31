"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — user can still select the text manually.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-hairline bg-bg px-3 py-2 text-xs text-subtle">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-black transition hover:brightness-95"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
