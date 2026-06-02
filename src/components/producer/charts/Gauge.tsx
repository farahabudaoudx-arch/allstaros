"use client";

const GOLD = "#f6c945";
const TRACK = "#1f1f1f";

export function Gauge({
  value,
  label,
  size = 132,
}: {
  // 0–100
  value: number;
  label: string;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={GOLD}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-ink">{Math.round(clamped)}%</span>
        </div>
      </div>
      <span className="text-center text-xs font-medium uppercase tracking-[0.14em] text-mute">
        {label}
      </span>
    </div>
  );
}
