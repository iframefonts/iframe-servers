/**
 * Copies the Elorus books into the Finance tables. Read-only towards Elorus.
 * Usage: pnpm finance:sync   (same daily request budget as the app: FINANCE_DAILY_REQUESTS)
 */
import "dotenv/config";
import { runFinanceSync } from "@/lib/finance/sync";

async function main() {
  const r = await runFinanceSync("script");
  console.log(r);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
