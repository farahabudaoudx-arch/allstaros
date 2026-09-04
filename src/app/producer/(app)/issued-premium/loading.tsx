export default function IssuedPremiumLoading() {
  return (
    <main
      aria-label="Loading Issued Premium"
      aria-busy="true"
      className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14"
    >
      <div className="h-8 w-40 animate-pulse rounded-lg bg-card-hi" />
      <div className="mt-8 h-36 animate-pulse rounded-2xl bg-card-hi" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-card-hi" />
        <div className="h-28 animate-pulse rounded-2xl bg-card-hi" />
        <div className="h-28 animate-pulse rounded-2xl bg-card-hi" />
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-card-hi" />
      <span className="sr-only">Loading Issued Premium</span>
    </main>
  );
}
