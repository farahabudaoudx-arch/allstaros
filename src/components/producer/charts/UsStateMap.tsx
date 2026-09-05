"use client";

import { useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import statesTopojson from "us-atlas/states-10m.json";

export type StateDatum = {
  value: number;
  display: string;
  sub?: string;
};

const GOLD = "#f6c945";
const MAP_WIDTH = 780;
const MAP_HEIGHT = 480;

type StateProperties = { name?: string };

const projection = geoAlbersUsa()
  .scale(850)
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
const pathGenerator = geoPath(projection);
const stateFeatures = feature(
  statesTopojson as never,
  statesTopojson.objects.states as never,
) as unknown as FeatureCollection<Geometry, StateProperties>;

const NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

function colorFor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "rgba(255,255,255,0.05)";
  const t = Math.max(0.15, Math.min(1, value / max));
  return `rgba(246, 201, 69, ${t})`;
}

export function UsStateMap({
  data,
  metricLabel,
}: {
  data: Record<string, StateDatum>;
  metricLabel: string;
}) {
  const [hovered, setHovered] = useState<{ code: string; x: number; y: number } | null>(null);
  const max = Math.max(0, ...Object.values(data).map((d) => d.value));
  const hoveredDatum = hovered ? data[hovered.code] : null;
  const hoveredName = hovered
    ? Object.entries(NAME_TO_CODE).find(([, c]) => c === hovered.code)?.[0] ?? hovered.code
    : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`${metricLabel} by U.S. state`}
        style={{ width: "100%", height: "auto" }}
      >
        {stateFeatures.features.map((geo) => {
          const name = geo.properties?.name ?? "";
          const code = NAME_TO_CODE[name];
          const datum = code ? data[code] : undefined;
          const fill = colorFor(datum?.value ?? 0, max);
          const isHovered = hovered?.code === code;
          const path = pathGenerator(geo);
          if (!path) return null;

          return (
            <path
              key={String(geo.id ?? name)}
              d={path}
              fill={fill}
              stroke={isHovered ? GOLD : "rgba(255,255,255,0.16)"}
              strokeWidth={isHovered ? 1.5 : 0.5}
              style={{ outline: "none", cursor: datum ? "pointer" : "default" }}
              onMouseEnter={(e) => {
                if (!code) return;
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const bbox = e.currentTarget.getBoundingClientRect();
                setHovered({
                  code,
                  x: bbox.left - rect.left + bbox.width / 2,
                  y: bbox.top - rect.top,
                });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {hovered && hoveredDatum && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: hovered.x, top: hovered.y, transform: "translate(-50%, calc(-100% - 8px))" }}
        >
          <div className="whitespace-nowrap rounded-xl border border-hairline bg-card-hi px-3 py-2 shadow-xl">
            <div className="text-xs text-subtle">{hoveredName}</div>
            <div className="mt-1 text-xl font-semibold leading-none tabular-nums text-accent">
              {hoveredDatum.display}
            </div>
            <div className="mt-1 text-[10px] text-mute">
              {metricLabel}
              {hoveredDatum.sub ? ` · ${hoveredDatum.sub}` : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
