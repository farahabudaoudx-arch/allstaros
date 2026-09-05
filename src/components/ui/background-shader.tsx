"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useSyncExternalStore, type ReactNode } from "react";

function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getServerReducedMotion = () => true;
const colors = ["#080808", "#242424", "#707070", "#404040"];

export default function BackgroundShader({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, getServerReducedMotion);

  return (
    <div className="relative isolate overflow-hidden bg-neutral-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#555,#080808)]">
        <MeshGradient
          style={{ height: "100%", width: "100%" }}
          distortion={0.8}
          swirl={0.1}
          offsetX={0}
          offsetY={0}
          scale={1}
          rotation={0}
          speed={reducedMotion ? 0 : 1}
          colors={colors}
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
