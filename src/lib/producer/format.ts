// Display formatters for producer metrics. Money is stored in cents.

export function money(cents: number, opts: { compact?: boolean } = {}): string {
  const dollars = (cents ?? 0) / 100;
  if (opts.compact && Math.abs(dollars) >= 1000) {
    return `$${(dollars / 1000).toFixed(dollars >= 100000 ? 0 : 1)}k`;
  }
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function moneyExact(cents: number): string {
  return ((cents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function num(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function pctValue(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}
