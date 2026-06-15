"use client";

import { useState } from "react";
import { completeAccountSetup } from "@/lib/actions/account-setup";
import { US_STATES } from "@/lib/us-states";
import { Field, Input, Button } from "@/components/ui";

export function SetupForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
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
    setStatus("saving");
    setError("");
    try {
      const result = await completeAccountSetup({
        firstName,
        lastName,
        phone,
        state,
        password,
      });
      if (!result.ok) {
        setError(result.error);
        setStatus("error");
        return;
      }
      // Full navigation so the server re-renders with the now-complete account.
      window.location.href = result.next;
    } catch {
      // A dropped connection mid-submit surfaces as "TypeError: Load failed" in
      // Safari. Catch it so the spinner doesn't hang forever (and so it stops
      // bubbling to window.onerror / Sentry) — let them simply try again.
      setError(
        "Something went wrong — check your connection and try again.",
      );
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName">
          <Input
            id="firstName"
            required
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input
            id="lastName"
            required
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Phone" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          required
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
        />
      </Field>

      <Field label="State" htmlFor="state">
        <select
          id="state"
          required
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
        >
          <option value="" disabled>
            Select your state
          </option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field label="Confirm password" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={status === "saving"}
        className="w-full py-2.5"
      >
        {status === "saving" ? "Setting up…" : "Finish setup"}
      </Button>

      {status === "error" ? <p className="text-sm text-neg">{error}</p> : null}
    </form>
  );
}
