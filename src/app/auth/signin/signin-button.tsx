"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Button } from "@/components/ui";

export default function SignInButton({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-pos/40 bg-pos/[0.08] p-4 text-sm text-pos">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1">
          We sent a sign-in link to <strong>{email}</strong>. Click it to come
          back.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
        Email
      </label>
      <Input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Button
        type="submit"
        variant="primary"
        disabled={status === "sending"}
        className="w-full py-2.5"
      >
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </Button>
      {error ? <p className="text-sm text-neg">{error}</p> : null}
    </form>
  );
}
