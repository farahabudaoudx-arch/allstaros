"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Button } from "@/components/ui";

export default function ResetConfirmPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don’t match.");
      setStatus("error");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(
        "This reset link has expired. Request a new one from the sign-in page.",
      );
      setStatus("error");
      return;
    }
    window.location.href = "/";
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
            Choose a new password
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            New password
          </label>
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Confirm password
          </label>
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={status === "saving"}
            className="w-full py-2.5"
          >
            {status === "saving" ? "Saving…" : "Update password"}
          </Button>
          {error ? <p className="text-sm text-neg">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
