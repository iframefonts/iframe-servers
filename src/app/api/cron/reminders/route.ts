import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { retryReminders, runReminders } from "@/lib/reminders/engine";

export const maxDuration = 300;

/** Daily 09:00 Athens (vercel.json: 07:00 UTC). Idempotent: safe to call again. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const retried = await retryReminders();
  const summary = await runReminders();
  return NextResponse.json({ ...summary, retried });
}
