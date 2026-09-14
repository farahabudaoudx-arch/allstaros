"use client";

import { useActionState, useState } from "react";
import { Input, Button } from "@/components/ui";
import { updatePasswordAction, type UpdatePasswordState } from "../actions";
import { InstallationLogo } from "@/components/InstallationLogo";

const initialState: UpdatePasswordState = { ok: true };

export default function ResetConfirmPage() {
  // Controlled inputs so the typed values survive the re-render after a
  // failed attempt (React resets uncontrolled fields when a form action ends).
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState("");
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  // Client-side pre-checks, same rules as before. The action re-checks length.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (password !== confirm) {
      e.preventDefault();
      setClientError("Passwords don’t match.");
      return;
    }
    if (password.length < 8) {
      e.preventDefault();
      setClientError("Password must be at least 8 characters.");
      return;
    }
    setClientError("");
  }

  const error = clientError || (!state.ok ? state.error : "");

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <InstallationLogo className="app-logo mx-auto h-10 w-auto" />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
            Choose a new password
          </h1>
        </div>

        <form action={formAction} onSubmit={onSubmit} className="space-y-3">
          <label className="block text-[10px] uppercase tracking-[0.16em] text-mute">
            New password
          </label>
          <Input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <label className="block text-[10px] uppercase tracking-[0.16em] text-mute">
            Confirm password
          </label>
          <Input
            type="password"
            name="confirm"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="w-full py-2.5"
          >
            {pending ? "Saving…" : "Update password"}
          </Button>
          {error ? <p className="text-sm text-neg">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
