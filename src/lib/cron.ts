import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(req: NextRequest) {
  return Boolean(env.cronSecret) && req.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}
