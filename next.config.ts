import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal admin + pay pages: every page shows live, per-request data. Nothing to prerender.
  cacheComponents: false,
  // Internal tool: tell every crawler not to index or follow anything this app serves
  // (pages, pay links, API routes, files). Applies only to this app's host, never to iframe.gr.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
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
