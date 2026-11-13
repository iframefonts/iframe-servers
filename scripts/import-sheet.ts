/**
 * Imports the renewal-month spreadsheet (HTML export: one column per month, one domain per cell).
 *   pnpm import:sheet Servers/Sheet1.html [--dry-run]
 *
 * Each domain becomes a website + an unlinked client + a package expiring at the end of its month
 * (the next occurrence of that month). Everything imports with reminders PAUSED and price 0:
 * link each client to Elorus and set the plan/price before resuming reminders.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db";
import { addPeriod, athensDay } from "../src/lib/dates";
import { domainRe, normalizeDomain } from "../src/lib/domains";

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();

type Row = { raw: string; domain: string; month: number; note?: string; valid: boolean };

export function parseSheet(html: string): Row[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1])));
  const out: Row[] = [];
  for (const cells of rows) {
    // cells[0] is the spreadsheet row number; cells[1..12] are January..December.
    if (!/^\d+$/.test(cells[0] ?? "")) continue;
    if (cells.slice(1).some((c) => /ΕΝΗΜΕΡΩΣΗ|ΠΛΗΡΩΜΗ|ΑΝΕΞΟΦΛΗΤΟ|Ιανουάριος/.test(c))) continue; // header + legend
    cells.slice(1, 13).forEach((cell, i) => {
      if (!cell) return;
      const withDomain = /\+\s*domain/i.test(cell);
      const cleaned = normalizeDomain(cell.replace(/\+\s*domain/i, ""));
      const valid = domainRe.test(cleaned);
      out.push({
        raw: cell,
        domain: valid ? cleaned : cleaned.replace(/\s+/g, "-"),
        month: i + 1,
        note: [withDomain && "Includes domain registration", !valid && `Check the domain: sheet says “${cell}”`].filter(Boolean).join(". ") || undefined,
        valid,
      });
    });
  }
  return out;
}

async function main() {
  const rows = parseSheet(readFileSync(file, "utf8"));
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.domain) ? false : (seen.add(r.domain), true)));
  const dupes = rows.length - unique.length;
  console.log(`${rows.length} cells, ${unique.length} unique domains, ${dupes} duplicate${dupes === 1 ? "" : "s"} skipped, ${unique.filter((r) => !r.valid).length} to check.`);
  if (dryRun) {
    for (const r of unique) console.log(`${String(r.month).padStart(2)}  ${r.domain}${r.note ? `   (${r.note})` : ""}`);
    return;
  }

  const db = createDb(process.env.DATABASE_URL);
  const plan =
    (await db.plan.findFirst({ where: { name: "Imported (set price)" } })) ??
    (await db.plan.create({ data: { name: "Imported (set price)", priceNetCents: 0, periodMonths: 12 } }));
  let created = 0;
  let skipped = 0;
  for (const r of unique) {
    if (await db.website.findUnique({ where: { domain: r.domain } })) {
      skipped++;
      continue;
    }
    const year = r.month >= nowMonth ? nowYear : nowYear + 1;
    const lastDay = new Date(Date.UTC(year, r.month, 0)).getUTCDate();
    const expiresAt = athensDay(year, r.month, lastDay);
    await db.client.create({
      data: {
        name: r.domain,
        notes: `Imported from the renewals sheet (${r.raw}). Link to Elorus.`,
        websites: { create: { domain: r.domain, notes: r.note } },
      },
    });
    const client = await db.client.findFirstOrThrow({ where: { websites: { some: { domain: r.domain } } }, include: { websites: true } });
    await db.hostingPackage.create({
      data: {
        clientId: client.id,
        planId: plan.id,
        startDate: addPeriod(expiresAt, -12),
        expiresAt,
        remindersEnabled: false,
        notes: r.note,
        websites: { create: { websiteId: client.websites[0].id } },
      },
    });
    created++;
  }
  console.log(`Imported ${created} packages (reminders paused). ${skipped} already existed.`);
  await db.$disconnect();
}

if (process.argv[1]?.endsWith("import-sheet.ts")) {
  if (!file) {
    console.error("Usage: pnpm import:sheet <file.html> [--dry-run]");
    process.exit(1);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
