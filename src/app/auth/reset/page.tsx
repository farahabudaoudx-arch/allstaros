"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Button } from "@/components/ui";

export default function ResetPage() {
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
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset/confirm`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo },
    );
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={140}
            height={79}
            priority
            className="mx-auto h-10 w-auto"
          />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
            Reset your password
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Enter your email and we’ll send a link to set a new password.
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-xl border border-pos/40 bg-pos/[0.08] p-4 text-sm text-pos">
            <p className="font-medium">Check your inbox.</p>
            <p className="mt-1">
              If an account exists for <strong>{email}</strong>, a reset link is
              on its way.
            </p>
          </div>
        ) : (
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
              {status === "sending" ? "Sending…" : "Send reset link"}
            </Button>
            {error ? <p className="text-sm text-neg">{error}</p> : null}
          </form>
        )}

        <p className="mt-6 text-center text-xs text-mute">
          <Link href="/auth/signin" className="underline hover:text-accent">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
