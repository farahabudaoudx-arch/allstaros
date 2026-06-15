"use client";

import { useState } from "react";
import { inviteRecruitByEmail } from "@/lib/actions/recruits";
import { Input, Button, Spinner } from "@/components/ui";

/**
 * Builder-facing "invite a recruit" form. The builder enters only an email; the
 * recruit fills in the rest of their details when they accept the invite. This
 * is the only path that creates an account — there is no public sign-up.
 */
export function InviteRecruit() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const result = await inviteRecruitByEmail(email);
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setEmail("");
    setStatus("sent");
  }

  return (
    <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/[0.05] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        Invite a recruit
      </p>
      <p className="mt-1.5 text-sm text-subtle">
        Enter their email and we’ll send a private setup link. Only people you
        invite can create an account.
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
          placeholder="recruit@example.com"
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
          Invite sent. They’ll appear below once they accept and finish setup.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-neg">{error}</p>
      ) : null}
    </div>
  );
}
