import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev route indicator (bottom-left "N"). Build/runtime
  // errors are still surfaced. (Next 16 removed the old sub-options.)
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/cron/gateway-issued-premium": [
      "./node_modules/playwright-core/browsers.json",
    ],
  },
};

export default nextConfig;
