"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Button } from "@/components/ui";

export default function SignInButton({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("signing");
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (err) {
      setError("That email and password don’t match. Try again.");
      setStatus("error");
      return;
    }
    // Full navigation through the login recorder (captures IP/location), which
    // then forwards to `next` with the new session cookie in place.
    window.location.href = `/auth/after-login?next=${encodeURIComponent(next)}`;
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
      <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
        Password
      </label>
      <Input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />
      <Button
        type="submit"
        variant="primary"
        disabled={status === "signing"}
        className="w-full py-2.5"
      >
        {status === "signing" ? "Signing in…" : "Sign in"}
      </Button>
      {error ? <p className="text-sm text-neg">{error}</p> : null}
      <p className="pt-1 text-center text-xs text-mute">
        <Link href="/auth/reset" className="underline hover:text-accent">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
