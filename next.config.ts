import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal admin + pay pages: every page shows live, per-request data. Nothing to prerender.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
