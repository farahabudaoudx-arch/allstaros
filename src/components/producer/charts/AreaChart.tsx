"use client";

import { useEffect, useRef, useState, useMemo } from "react";

export type ChartPoint = {
  value: number;
  label?: string;
  date?: string;
  meta?: Record<string, unknown>;
};

const GOLD = "#f6c945";
const GRID = "#1f1f1f";
const INNER = "#0d0d0d";

export function AreaChart({
  points,
  viewBoxHeight = 300,
  initialHighlight,
  onHighlightChange,
}: {
  points: ChartPoint[];
  viewBoxHeight?: number;
  initialHighlight?: number;
  onHighlightChange?: (point: ChartPoint | null, index: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const defaultHi = initialHighlight ?? null;
  const [hi, setHi] = useState<number | null>(defaultHi);

  const onChangeRef = useRef(onHighlightChange);
  useEffect(() => {
    onChangeRef.current = onHighlightChange;
  }, [onHighlightChange]);

  useEffect(() => {
    setHi(defaultHi);
  }, [points, defaultHi]);

  const layout = useMemo(() => {
    const w = 1000;
    const h = viewBoxHeight;
    const padX = 20;
    const padY = 24;
    if (!points.length) {
      return { w, h, padX, padY, coords: [] as { x: number; y: number }[], linePath: "", areaPath: "", min: 0, max: 0, step: 0 };
    }
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const step = (w - padX * 2) / (points.length - 1 || 1);
    const coords = points.map((p, i) => {
      const x = padX + i * step;
      const y = padY + (h - padY * 2) - ((p.value - min) / range) * (h - padY * 2);
      return { x, y };
    });
    const linePath = `M ${coords.map((c) => `${c.x},${c.y}`).join(" L ")}`;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x},${h} L ${coords[0].x},${h} Z`;
    return { w, h, padX, padY, coords, linePath, areaPath, min, max, step };
  }, [points, viewBoxHeight]);

  function handleMove(ev: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !layout.coords.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (ev.clientX - rect.left) / rect.width;
    const xInSvg = xRatio * layout.w;
    const i = Math.round((xInSvg - layout.padX) / layout.step);
    const clamped = Math.max(0, Math.min(points.length - 1, i));
    if (clamped !== hi) {
      setHi(clamped);
      onChangeRef.current?.(points[clamped] ?? null, clamped);
    }
  }

  function handleLeave() {
    if (defaultHi !== hi) {
      setHi(defaultHi);
      onChangeRef.current?.(defaultHi != null ? points[defaultHi] ?? null : null, defaultHi);
    }
  }

  const highlightedCoord = hi != null ? layout.coords[hi] : null;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ cursor: "crosshair", display: "block" }}
      >
        <defs>
          <linearGradient id="producer-areagrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.5" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={layout.padX}
            x2={layout.w - layout.padX}
            y1={layout.padY + (layout.h - layout.padY * 2) * p}
            y2={layout.padY + (layout.h - layout.padY * 2) * p}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        {layout.areaPath && <path d={layout.areaPath} fill="url(#producer-areagrad)" />}
        {layout.linePath && (
          <path
            d={layout.linePath}
            fill="none"
            stroke={GOLD}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {highlightedCoord && (
          <>
            <line
              x1={highlightedCoord.x}
              x2={highlightedCoord.x}
              y1={layout.padY}
              y2={layout.h - layout.padY}
              stroke={GOLD}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.7}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={highlightedCoord.x}
              cy={highlightedCoord.y}
              r={6}
              fill={GOLD}
              stroke={INNER}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}
