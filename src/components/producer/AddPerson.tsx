"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  inviteRecruitByEmail,
  inviteProducerByEmail,
} from "@/lib/actions/recruits";
import { Input, Button, Spinner } from "@/components/ui";

type Kind = "recruit" | "producer";

/**
 * The single entry point for adding someone to your team. Replaces the two
 * near-identical "invite a recruit" / "invite a producer" forms that builders
 * kept confusing — a new recruit was being invited through the producer path and
 * landing on the team already "graduated", skipping the whole pipeline.
 *
 * Here you must consciously pick which kind of person you're adding. "New recruit"
 * is the default. "Already-licensed producer" SKIPS licensing + boot camp, so it's
 * gated behind an explicit confirmation checkbox AND a confirm dialog before the
 * invite can go out.
 */
export function AddPerson() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("recruit");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  const isProducer = kind === "producer";

  function pick(next: Kind) {
    setKind(next);
    if (status !== "idle") setStatus("idle");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Last line of defence before someone skips the pipeline by mistake.
    if (isProducer) {
      const ok = window.confirm(
        "This person will join your team directly as a producer and SKIP the " +
          "recruiting pipeline.\n\nOnly do this if they already have their license. " +
          "If they don’t have a license yet, choose “Does Not Have License” instead.",
      );
      if (!ok) return;
    }

    setStatus("sending");
    setError("");
    const result = isProducer
      ? await inviteProducerByEmail(email)
      : await inviteRecruitByEmail(email);
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setEmail("");
    setStatus("sent");
    // Reflect the new pending invite without a manual refresh.
    router.refresh();
  }

  return (
    <div
      className="mt-8 rounded-2xl border border-accent/30 bg-accent/[0.05] p-5"
    >
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
        Add someone to your team
      </h2>
      <p className="mt-1 text-sm text-subtle">
        Enter their email and we&rsquo;ll send a private setup link. First, choose
        who you&rsquo;re adding — this decides whether they go through our licensing
        pipeline.
      </p>

      {/* The choice — the whole point of this component. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <KindOption
          selected={kind === "recruit"}
          onSelect={() => pick("recruit")}
          tone="accent"
          title="Does Not Have License"
          body="Starts in our recruiting pipeline to walk them through getting their license."
        />
        <KindOption
          selected={kind === "producer"}
          onSelect={() => pick("producer")}
          tone="accent"
          title="Has License"
          body="Joins your team directly as a producer with their own portal."
        />
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          placeholder={isProducer ? "producer@example.com" : "recruit@example.com"}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={status === "sending"}
          className="shrink-0 px-5 py-2.5"
        >
          {status === "sending" ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            "Send invite"
          )}
        </Button>
      </form>

      {status === "sent" ? (
        <p className="mt-3 text-sm text-pos">
          Invite sent.{" "}
          {isProducer
            ? "They’ll show in My Downline as “Invite Sent” until they finish setup."
            : "They’ll appear in your pipeline once they accept and finish setup."}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-neg">{error}</p>
      ) : null}
    </div>
  );
}

function KindOption({
  selected,
  onSelect,
  tone,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  tone: "accent" | "warn";
  title: string;
  body: string;
}) {
  const ring = selected
    ? tone === "warn"
      ? "border-warn bg-warn/[0.08]"
      : "border-accent bg-accent/[0.08]"
    : "border-hairline bg-card hover:border-mute";
  const dot = selected
    ? tone === "warn"
      ? "border-warn"
      : "border-accent"
    : "border-mute";
  const dotFill = tone === "warn" ? "bg-warn" : "bg-accent";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${ring}`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${dot}`}
      >
        {selected ? <span className={`h-2 w-2 rounded-full ${dotFill}`} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-subtle">
          {body}
        </span>
      </span>
    </button>
  );
}
