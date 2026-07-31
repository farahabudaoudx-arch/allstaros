import FlashBanner from "./flash-banner";

export default function PortalShell({
  flash,
  heading,
  children,
}: {
  flash?: { ok?: string; error?: string; milestone?: string };
  heading?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      {heading}
      {flash ? <FlashBanner flash={flash} /> : null}
      {children}
    </main>
  );
}

export function PortalHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-xs uppercase tracking-[0.18em] text-accent">
        {"// "}
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-ink md:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 max-w-md text-sm leading-6 text-subtle">{subtitle}</p>
      ) : null}
    </div>
  );
}
