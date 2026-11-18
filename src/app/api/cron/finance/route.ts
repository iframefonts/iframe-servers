import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { runFinanceSync } from "@/lib/finance/sync";

export const maxDuration = 300;

/** Nightly: copy new or changed Elorus invoices, credit notes, bills and expenses for the Finance page, within its daily request budget. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runFinanceSync("cron", { budgetMs: 240_000 });
  return NextResponse.json(result);
}
