"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Input, Button } from "@/components/ui";
import { signInAction, type SignInState } from "./_actions";

const initialState: SignInState = { ok: true };

export default function SignInButton({ next }: { next: string }) {
  // Controlled inputs so the typed values survive the re-render after a
  // failed attempt (React resets uncontrolled fields when a form action ends).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-[10px] uppercase tracking-[0.16em] text-mute">
        Email
      </label>
      <Input
        type="email"
        name="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <label className="block text-[10px] uppercase tracking-[0.16em] text-mute">
        Password
      </label>
      <Input
        type="password"
        name="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full py-2.5"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {!state.ok ? <p className="text-sm text-neg">{state.error}</p> : null}
      <p className="pt-1 text-center text-xs text-mute">
        <Link href="/auth/reset" className="underline hover:text-accent">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
