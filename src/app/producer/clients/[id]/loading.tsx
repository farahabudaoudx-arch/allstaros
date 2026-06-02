export default function ClientDetailLoading() {
  return (
    <main className="ll-analytics mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="space-y-7 pt-2 animate-pulse">
        <div className="h-7 w-28 rounded-full" style={{ background: "var(--surface-soft)" }} />
        <div className="h-12 w-64 rounded-xl" style={{ background: "var(--surface-soft)" }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-[18px]" style={{ background: "var(--surface-soft)" }} />
          ))}
        </div>
        <div className="h-48 rounded-[22px]" style={{ background: "var(--surface-soft)" }} />
      </div>
    </main>
  );
}
