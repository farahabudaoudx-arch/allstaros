"use client";

import { useState, useTransition } from "react";
import { signUpViaReferral } from "@/lib/actions/recruit-signup";
import { US_STATES } from "@/lib/us-states";

type Form = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
};

// The four data-collection cards, in order. The fifth card (index 4) is the
// post-signup welcome / tour and is reached only after a successful submit.
const STEPS = ["name", "email", "phone", "state"] as const;

function emailValid(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function phoneValid(v: string) {
  return (v.match(/\d/g)?.length ?? 0) >= 10;
}

export function JoinWizard({
  code,
  builderName,
}: {
  code: string;
  builderName: string;
}) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Form>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    state: "",
  });

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function stepValid(i: number): boolean {
    switch (STEPS[i]) {
      case "name":
        return form.firstName.trim().length > 0 && form.lastName.trim().length > 0;
      case "email":
        return emailValid(form.email);
      case "phone":
        return phoneValid(form.phone);
      case "state":
        return form.state.length > 0;
      default:
        return true;
    }
  }

  function next() {
    setError(null);
    if (!stepValid(step)) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    // Last input step → submit.
    startTransition(async () => {
      const result = await signUpViaReferral({ code, ...form });
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  const totalCards = STEPS.length + 1; // input steps + welcome card
  const currentCard = done ? STEPS.length : step;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-md">
        {/* Brand + sponsor */}
        <div className="mb-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            // All Star OS
          </p>
          {!done ? (
            <p className="mt-2 text-sm text-subtle">
              You were invited by{" "}
              <span className="font-medium text-ink">{builderName}</span>
            </p>
          ) : null}
        </div>

        {/* Progress dots */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalCards }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentCard
                  ? "w-6 bg-accent"
                  : i < currentCard
                    ? "w-1.5 bg-accent/50"
                    : "w-1.5 bg-hairline"
              }`}
            />
          ))}
        </div>

        <div className="rounded-3xl border border-hairline bg-card p-6 shadow-xl md:p-8">
          {done ? (
            <WelcomeCard email={form.email} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              {STEPS[step] === "name" && (
                <Card
                  eyebrow={`Step 1 of ${STEPS.length}`}
                  title="What's your name?"
                  subtitle="Let's start with the basics."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="First name"
                      value={form.firstName}
                      onChange={(v) => set({ firstName: v })}
                      autoFocus
                    />
                    <Field
                      label="Last name"
                      value={form.lastName}
                      onChange={(v) => set({ lastName: v })}
                    />
                  </div>
                </Card>
              )}

              {STEPS[step] === "email" && (
                <Card
                  eyebrow={`Step 2 of ${STEPS.length}`}
                  title="What's your email?"
                  subtitle="We'll send your sign-in link here."
                >
                  <Field
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(v) => set({ email: v })}
                    autoFocus
                  />
                </Card>
              )}

              {STEPS[step] === "phone" && (
                <Card
                  eyebrow={`Step 3 of ${STEPS.length}`}
                  title="What's your phone number?"
                  subtitle="So your team can reach you."
                >
                  <Field
                    label="Phone"
                    type="tel"
                    value={form.phone}
                    onChange={(v) => set({ phone: v })}
                    placeholder="(555) 123-4567"
                    autoFocus
                  />
                </Card>
              )}

              {STEPS[step] === "state" && (
                <Card
                  eyebrow={`Step 4 of ${STEPS.length}`}
                  title="Which state are you in?"
                  subtitle="This sets up your licensing path."
                >
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-subtle">State</span>
                    <select
                      value={form.state}
                      onChange={(e) => set({ state: e.target.value })}
                      autoFocus
                      className="w-full rounded-xl border border-hairline bg-card-hi px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
                    >
                      <option value="">Select your state…</option>
                      {US_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </Card>
              )}

              {error ? (
                <p className="mt-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-3 py-2 text-xs text-neg">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex items-center gap-3">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    disabled={pending}
                    className="rounded-xl border border-hairline bg-card px-4 py-2.5 text-sm font-medium text-subtle transition hover:border-mute hover:text-ink disabled:opacity-50"
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={!stepValid(step) || pending}
                  className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending
                    ? "Creating your account…"
                    : step === STEPS.length - 1
                      ? "Create account"
                      : "Continue"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-subtle">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-subtle">{label}</span>
      <input
        type={type}
        value={value}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline bg-card-hi px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent"
      />
    </label>
  );
}

function WelcomeCard({ email }: { email: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        // You're in
      </p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
        Welcome to the team
      </h1>
      <p className="mt-1.5 text-sm text-subtle">
        Watch this quick tour, then get started.
      </p>

      {/* Video placeholder (16:9) */}
      <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl border border-hairline bg-gradient-to-br from-card-hi to-black">
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            aria-label="Play tour video"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:scale-105"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
          <p className="text-left font-mono text-[11px] text-white/80">Platform tour · 2:14</p>
        </div>
      </div>

      <a
        href="/auth/signin?next=/portal"
        className="mt-6 block w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-95"
      >
        Get started
      </a>
      <p className="mt-3 text-xs text-mute">
        We emailed a one-click sign-in link to{" "}
        <span className="text-subtle">{email}</span>.
      </p>
    </div>
  );
}
