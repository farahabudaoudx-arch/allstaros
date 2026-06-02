import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type Tone = "default" | "accent" | "pos" | "warn" | "neg";

const toneText: Record<Tone, string> = {
  default: "text-subtle",
  accent: "text-accent",
  pos: "text-pos",
  warn: "text-warn",
  neg: "text-neg",
};

const toneDotBg: Record<Tone, string> = {
  default: "bg-mute",
  accent: "bg-accent",
  pos: "bg-pos",
  warn: "bg-warn",
  neg: "bg-neg",
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Centered page container matching the agency content width + padding. */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cx(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-10 md:px-10 md:py-14",
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Bordered surface. Set `interactive` for the hover treatment used on clickable cards. */
export function Card({
  children,
  className,
  interactive = false,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-5",
        accent ? "border-accent/40 bg-accent/[0.04]" : "border-hairline bg-card",
        interactive &&
          (accent
            ? "transition hover:border-accent"
            : "transition hover:border-mute hover:bg-card-hi"),
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Section header with a mono kicker, title, and optional right-aligned slot. */
export function SectionHeading({
  kicker,
  title,
  right,
  className,
}: {
  kicker?: string;
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4", className)}>
      <div>
        {kicker ? (
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
            {kicker}
          </div>
        ) : null}
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          {title}
        </h2>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** KPI / stat tile: mono label, large value, optional toned hint. */
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <div className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">
        {value}
      </div>
      {hint ? (
        <div className={cx("mt-1 text-sm", toneText[tone])}>{hint}</div>
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const styles: Record<Tone, string> = {
    default: "border-hairline bg-card-hi text-subtle",
    accent: "border-accent/40 bg-accent/[0.06] text-accent",
    pos: "border-pos/40 bg-pos/[0.08] text-pos",
    warn: "border-warn/40 bg-warn/[0.08] text-warn",
    neg: "border-neg/40 bg-neg/[0.08] text-neg",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ToneDot({ tone = "default" }: { tone?: Tone }) {
  return (
    <span className={cx("inline-block h-2 w-2 rounded-full", toneDotBg[tone])} />
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(
  variant: ButtonVariant = "secondary",
  className?: string,
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-black hover:bg-accent-soft",
    secondary:
      "border border-hairline text-ink hover:border-accent hover:text-accent",
    ghost: "text-subtle hover:text-ink",
    danger:
      "border border-neg/40 text-neg hover:border-neg hover:bg-neg/[0.08]",
  };
  return cx(base, variants[variant], className);
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: { variant?: ButtonVariant } & ComponentProps<"button">) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: { variant?: ButtonVariant } & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** Labelled form field with the agency mono-label treatment. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute"
      >
        {label}
      </label>
      {children}
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
