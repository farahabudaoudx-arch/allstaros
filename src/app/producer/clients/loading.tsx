export default function ClientsLoading() {
  return (
    <main className="ll-analytics mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div className="space-y-6 pt-2 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-14 w-48 rounded-xl" style={{ background: "var(--surface-soft)" }} />
          <div className="h-11 flex-1 max-w-md rounded-2xl" style={{ background: "var(--surface-soft)" }} />
          <div className="h-11 w-32 rounded-full" style={{ background: "var(--surface-soft)" }} />
        </div>
        <div className="h-44 rounded-[22px]" style={{ background: "var(--surface-soft)", maxWidth: 760 }} />
        <div className="h-96 rounded-[22px]" style={{ background: "var(--surface-soft)" }} />
      </div>
    </main>
  );
}
