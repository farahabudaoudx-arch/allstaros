"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteProducerByEmail } from "@/lib/actions/recruits";
import { Input, Button, Spinner } from "@/components/ui";

/**
 * Builder-facing "invite a producer" form on My Downline. The builder enters an
 * email; the producer fills in the rest (name, phone, state, password) when they
 * accept. They appear in the list immediately as "Invite Sent" and flip to
 * "Active Profile" once they finish setup.
 */
export function InviteProducer() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const result = await inviteProducerByEmail(email);
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setEmail("");
    setStatus("sent");
    // Reflect the new "Invite Sent" row without a manual refresh.
    router.refresh();
  }

  return (
    <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/[0.05] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        Invite a producer
      </p>
      <p className="mt-1.5 text-sm text-subtle">
        Enter their email and we&rsquo;ll send a private setup link. They&rsquo;ll
        show below as &ldquo;Invite Sent&rdquo; until they finish setting up.
      </p>

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
          placeholder="producer@example.com"
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
          Invite sent. They&rsquo;ll show below as &ldquo;Invite Sent&rdquo; until
          they accept and finish setup.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-neg">{error}</p>
      ) : null}
    </div>
  );
}
