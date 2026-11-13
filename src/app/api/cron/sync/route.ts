import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { db } from "@/lib/db";
import { syncAllClients } from "@/lib/elorus/sync";

export const maxDuration = 300;

/** Nightly: refresh linked clients from Elorus; drop provider payloads older than 90 days. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sync = await syncAllClients();
  const cutoff = new Date(Date.now() - 90 * 86400_000);
  const pruned = await db.$executeRaw`UPDATE "Payment" SET "rawPayload" = NULL WHERE "rawPayload" IS NOT NULL AND "paidAt" < ${cutoff}`;
  return NextResponse.json({ ...sync, pruned });
}
