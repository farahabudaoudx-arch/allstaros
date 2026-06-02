export default function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-subtle">{subtitle}</p>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
