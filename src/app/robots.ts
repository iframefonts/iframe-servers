import type { MetadataRoute } from "next";

/**
 * webhosting.iframe.gr is an internal tool: nothing on it should be crawled.
 * Served only by this app, so it never affects the main iframe.gr site.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
