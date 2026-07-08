import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev route indicator (bottom-left "N"). Build/runtime
  // errors are still surfaced. (Next 16 removed the old sub-options.)
  devIndicators: false,
  // Next locks the dist dir to one dev server. A second local instance (e.g.
  // side-by-side role previews on another port) sets NEXT_DIST_DIR to get its
  // own build folder. Unset (all normal use and prod builds) means ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
