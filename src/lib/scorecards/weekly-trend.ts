export function weeklyShares(values: number[]): number[] {
  const safeValues = values.map((value) => (
    Number.isFinite(value) ? Math.max(0, value) : 0
  ));
  const total = safeValues.reduce((sum, value) => sum + value, 0);

  if (total === 0) return safeValues.map(() => 0);

  return safeValues.map((value) => (value / total) * 100);
}
