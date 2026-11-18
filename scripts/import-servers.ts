/**
 * Brings the database in line with the domain lists pasted from Plesk (one text file per server).
 *   pnpm import:servers Servers/*.txt [--dry-run]
 *
 * For every Active domain on a server:
 *   - already in the database → only fills in its server if that is empty
 *   - an old entry without its extension or hyphens ("12pyles", "mareasuites.gr") → renamed to the server's spelling
 *   - a second domain of an existing site (same name, other extension, a subdomain, or listed in ATTACH)
 *     → added as a website on that site's package(s)
 *   - anything else → new website + unlinked client + package, like the sheet import: price 0,
 *     reminders paused, placeholder expiry today + 12 months (the server list has no renewal date)
 * Disabled domains and the servers' own hostnames are skipped. Running it twice changes nothing.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db";
import { addPeriod, startOfAthensDay } from "../src/lib/dates";
import { domainRe, normalizeDomain } from "../src/lib/domains";

/** Second domains whose name differs from the site they belong to. */
const ATTACH: Record<string, string> = { "ledadecoshop.com": "ledadeco.com" };
/** Old entries misspelled beyond what the automatic rules catch: stored name → server domain. */
const RENAME: Record<string, string> = { ioanninaphsycology: "ioanninapsychology.gr", geoplan: "mygeoplan.com" };

export type ServerDomain = { domain: string; server: string | null; disabled: boolean };

const hostRe = /\b(\d+\.linuxzone\d+\.grserver\.gr)\b/;

/** Reads a Plesk "Domains" list as copied from the browser: a domain line, then owner/status/usage lines. */
export function parsePlesk(text: string): ServerDomain[] {
  const out: ServerDomain[] = [];
  for (const line of text.split(/\r?\n/)) {
    const first = line.split("\t")[0].trim();
    const candidate = normalizeDomain(first);
    if (first && !/\s/.test(first) && domainRe.test(candidate)) {
      out.push({ domain: candidate, server: null, disabled: false });
    }
    const cur = out.at(-1);
    if (!cur) continue;
    const host = line.match(hostRe)?.[1];
    if (host && !cur.server) cur.server = host;
    if (/(^|\t)\s*(Disabled|Απενεργοποιημένο|Ανεσταλμένο|Suspended)\s*($|\t)/.test(line)) cur.disabled = true;
  }
  // An owner without the hostname in brackets (e.g. "sqseed_customer") is on the same server as the rest.
  const counts = new Map<string, number>();
  for (const d of out) if (d.server) counts.set(d.server, (counts.get(d.server) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  for (const d of out) d.server ??= main;
  return out.filter((d) => !/\.grserver\.gr$/.test(d.domain));
}

export type Action =
  | { kind: "setServer"; domain: string; server: string }
  | { kind: "rename"; from: string; to: string; server: string | null }
  | { kind: "attach"; domain: string; to: string; server: string | null }
  | { kind: "create"; domain: string; server: string | null }
  | { kind: "skipDisabled"; domain: string };

const tlds = /\.(com\.gr|[a-z]+)$/;
const base = (d: string) => d.replace(tlds, "").replace(/-/g, "");

/** Decides what to do for each server domain, given the websites already stored (domain → server). */
export function planImport(entries: ServerDomain[], existing: Map<string, string | null>): Action[] {
  const sites = new Map(existing);
  const actions: Action[] = [];
  const seen = new Set<string>();
  const active = entries.filter((e) => {
    if (seen.has(e.domain)) return false;
    seen.add(e.domain);
    if (e.disabled) actions.push({ kind: "skipDisabled", domain: e.domain });
    return !e.disabled;
  });
  // Exact matches and renames first, so second domains can attach to the renamed sites.
  const rest: ServerDomain[] = [];
  for (const e of active) {
    if (sites.has(e.domain)) {
      if (!sites.get(e.domain) && e.server) actions.push({ kind: "setServer", domain: e.domain, server: e.server });
      continue;
    }
    const listed = (s: string) => entries.some((x) => x.domain === s);
    const bare = [...sites.keys()].find(
      (s) =>
        RENAME[s] === e.domain ||
        (!s.includes(".") && s.replace(/-/g, "") === base(e.domain)) ||
        (s.replace(/-/g, "") === e.domain.replace(/-/g, "") && !listed(s)), // "mareasuites.gr" → "marea-suites.gr"
    );
    if (bare) {
      actions.push({ kind: "rename", from: bare, to: e.domain, server: e.server });
      sites.delete(bare);
      sites.set(e.domain, e.server);
    } else rest.push(e);
  }
  for (const e of rest) {
    const target =
      (ATTACH[e.domain] && sites.has(ATTACH[e.domain]) ? ATTACH[e.domain] : undefined) ??
      [...sites.keys()].find((s) => s.includes(".") && (base(s) === base(e.domain) || e.domain.endsWith(`.${s}`)));
    actions.push(target ? { kind: "attach", domain: e.domain, to: target, server: e.server } : { kind: "create", domain: e.domain, server: e.server });
    sites.set(e.domain, e.server);
  }
  return actions;
}

async function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const entries = files.flatMap((f) => parsePlesk(readFileSync(f, "utf8")));
  const db = createDb(process.env.DATABASE_URL);
  const websites = await db.website.findMany({ select: { domain: true, server: true } });
  const actions = planImport(entries, new Map(websites.map((w) => [w.domain, w.server])));

  const label: Record<Action["kind"], string> = {
    setServer: "Server set",
    rename: "Rename",
    attach: "Second domain",
    create: "New package",
    skipDisabled: "Skipped (disabled)",
  };
  for (const kind of Object.keys(label) as Action["kind"][]) {
    const list = actions.filter((a) => a.kind === kind);
    if (!list.length) continue;
    console.log(`\n${label[kind]} (${list.length})`);
    if (kind === "setServer") continue;
    for (const a of list) {
      if (a.kind === "rename") console.log(`  ${a.from} → ${a.to}`);
      else if (a.kind === "attach") console.log(`  ${a.domain} → package of ${a.to}`);
      else if (a.kind === "create" || a.kind === "skipDisabled") console.log(`  ${a.domain}`);
    }
  }
  if (dryRun) {
    console.log("\nDry run: nothing changed.");
    return db.$disconnect();
  }

  const plan =
    (await db.plan.findFirst({ where: { name: "Imported (set price)" } })) ??
    (await db.plan.create({ data: { name: "Imported (set price)", priceNetCents: 0, periodMonths: 12 } }));
  const expiresAt = addPeriod(startOfAthensDay(new Date()), 12);
  for (const a of actions) {
    if (a.kind === "setServer") {
      await db.website.update({ where: { domain: a.domain }, data: { server: a.server } });
    } else if (a.kind === "rename") {
      await db.website.update({ where: { domain: a.from }, data: { domain: a.to, server: a.server ?? undefined } });
    } else if (a.kind === "attach") {
      const target = await db.website.findUniqueOrThrow({ where: { domain: a.to }, include: { packages: true } });
      await db.website.create({
        data: {
          domain: a.domain,
          clientId: target.clientId,
          server: a.server,
          notes: `Second domain of ${a.to} (from the server list).`,
          packages: { create: target.packages.map((p) => ({ packageId: p.packageId })) },
        },
      });
    } else if (a.kind === "create") {
      const note = "Added from the server list: no renewal date known. Set the expiry date and plan, and link to Elorus.";
      await db.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: { name: a.domain, notes: note, websites: { create: { domain: a.domain, server: a.server } } },
          include: { websites: true },
        });
        await tx.hostingPackage.create({
          data: {
            clientId: client.id,
            planId: plan.id,
            startDate: addPeriod(expiresAt, -12),
            expiresAt,
            remindersEnabled: false,
            notes: note,
            websites: { create: { websiteId: client.websites[0].id } },
          },
        });
      });
    }
  }
  console.log("\nDone.");
  await db.$disconnect();
}

if (process.argv[1]?.endsWith("import-servers.ts")) {
  if (process.argv.slice(2).filter((a) => !a.startsWith("--")).length === 0) {
    console.error("Usage: pnpm import:servers <plesk-list.txt>... [--dry-run]");
    process.exit(1);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
