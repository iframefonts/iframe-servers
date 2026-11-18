/**
 * Copies the Elorus books (invoices, credit notes, bills, expenses) into FinanceDoc/FinanceLine.
 * Read-only towards Elorus. Each run:
 *  1. lists every document of each kind (cheap: 100 per page) and upserts the headers,
 *     deleting local copies of documents that no longer exist in Elorus;
 *  2. reads the full document (its lines) only when Elorus `modified` changed, while the
 *     daily request budget lasts (see FINANCE_DAILY_REQUESTS). The next run continues.
 */
import type { Db } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";
import { HttpElorus } from "@/lib/elorus/client";
import { env, mock } from "@/lib/env";
import { OTHER, categorize, type Rule } from "@/lib/finance/categories";
import type { FinanceKind } from "@/generated/prisma/enums";

export interface BooksReader {
  get<T>(path: string): Promise<T>;
}

type Row = Record<string, unknown>;
type Page = { next: string | null; results: Row[] };

const ENDPOINT: Record<FinanceKind, string> = { invoice: "invoices", credit_note: "creditnotes", bill: "bills", expense: "expenses" };
const INCOME: FinanceKind[] = ["invoice", "credit_note"];

/** myDATA document type → label shown on the Finance page. */
const MYDATA_LABEL: Record<string, string> = {
  "1.1": "Sales invoice ΤΔΑ (1.1)",
  "2.1": "Service invoice ΤΠΥ (2.1)",
  "2.2": "EU service invoice (2.2)",
  "2.3": "Non-EU service invoice (2.3)",
  "5.1": "Credit note (5.1)",
  "5.2": "Credit note (5.2)",
  "11.1": "Retail receipt ΑΛΠ (11.1)",
  "11.2": "Service receipt ΑΠΥ (11.2)",
  "11.4": "Retail credit note (11.4)",
};

/** Elorus "Προηγούμενα Υπόλοιπα" documents carry balances from before Elorus, not income. */
const isOpeningBalance = (docTypeTitle: string) => /υπολοιπ/i.test(docTypeTitle.normalize("NFD").replace(/\p{Diacritic}/gu, ""));

export const cents = (v: unknown, rate = 1) => Math.round(Number(v ?? 0) * rate * 100);

export function headerFromRow(kind: FinanceKind, r: Row, docTypes: Map<string, string>) {
  const date = String(r.date);
  const [y, m] = date.split("-").map(Number);
  const rate = Number(r.exchange_rate ?? 1) || 1; // amount in document currency × rate = EUR
  const net = cents(r.net, rate);
  const total = cents(r.total, rate);
  const docTypeTitle = docTypes.get(String(r.documenttype ?? "")) ?? "";
  const status = String(r.status ?? (r.draft ? "draft" : "issued"));
  const typeLabel =
    kind === "bill" ? "Bill" : kind === "expense" ? "Expense" : MYDATA_LABEL[String(r.mydata_document_type ?? "")] ?? (docTypeTitle || (kind === "credit_note" ? "Credit note" : "Invoice"));
  const contactId = (r.client ?? r.supplier ?? null) as string | null;
  const contactName = String(r.client_display_name ?? r.supplier_display_name ?? "");
  return {
    kind,
    elorusId: String(r.id),
    number: String(r.sequence_flat || r.number || r.reference || r.representation || r.id),
    date: new Date(`${date}T00:00:00Z`),
    year: y,
    month: m,
    status,
    included: !r.draft && status !== "draft" && status !== "void" && !isOpeningBalance(docTypeTitle),
    typeLabel,
    contactId: contactId ? String(contactId) : null,
    contactName,
    netCents: net,
    vatCents: total - net,
    totalCents: total,
    modified: String(r.modified ?? ""),
  };
}

export function linesFromDetail(kind: FinanceKind, d: Row, products: Map<string, string>, expenseCats: Map<string, string>, rules: Rule[]) {
  const rate = Number(d.exchange_rate ?? 1) || 1;
  const items = (d.items as Row[] | undefined) ?? [];
  return items.map((it) => {
    const title = String(it.title || it.description || "").slice(0, 300);
    const income = INCOME.includes(kind);
    const sourceLabel = income ? (it.product ? products.get(String(it.product)) ?? null : null) : it.expense_category ? expenseCats.get(String(it.expense_category)) ?? null : null;
    return {
      title,
      sourceLabel,
      netCents: cents(it.item_net ?? it.amount, rate),
      category: income ? categorize(rules, { title, sourceLabel }) : sourceLabel || "Uncategorised",
    };
  });
}

async function listAll(api: BooksReader, path: string): Promise<Row[]> {
  const out: Row[] = [];
  let url: string | null = path;
  while (url) {
    const page: Page = await api.get<Page>(url);
    out.push(...page.results);
    url = page.next ? page.next.replace(/^https?:\/\/[^/]+\/v1\.2/, "") : null;
  }
  return out;
}

const titleMap = (rows: Row[]) => new Map(rows.map((r) => [String(r.id), String(r.title ?? r.name ?? "")]));

export type FinanceSyncResult = { documents: number; detailed: number; remaining: number; deleted: number; failed?: number; throttled?: boolean; requests?: number };

/**
 * Elorus allows each API key a limited number of requests per day (we were blocked for 22 hours
 * after ~900), and issuing invoices needs that same quota. Finance therefore spends at most this
 * many requests per 24 hours, and none at all for 24 hours after Elorus throttles it once.
 */
export const FINANCE_DAILY_REQUESTS = 100;
/** Listing every document takes ~15 requests; don't start a run that can't finish the listing. */
const MIN_REQUESTS_TO_START = 30;

class BudgetSpent extends Error {}

export async function syncFinance(
  opts: { db?: Db; api?: BooksReader; budgetMs?: number; concurrency?: number; maxRequests?: number; meter?: { requests: number } } = {},
): Promise<FinanceSyncResult> {
  const db = opts.db ?? defaultDb;
  if (!opts.api && mock.elorus) return { documents: 0, detailed: 0, remaining: 0, deleted: 0, requests: 0 };
  const raw = opts.api ?? new HttpElorus(env.elorus.financeToken || undefined);
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const maxRequests = opts.maxRequests ?? FINANCE_DAILY_REQUESTS;
  const meter = opts.meter ?? { requests: 0 };
  // Every Elorus request goes through here, so the budget can't be overspent.
  const api: BooksReader = {
    get: <T,>(path: string) => {
      if (meter.requests >= maxRequests) return Promise.reject(new BudgetSpent());
      meter.requests++;
      return raw.get<T>(path);
    },
  };

  const [docTypes, products, expenseCats, rules] = await Promise.all([
    listAll(api, "/documenttypes/?page_size=100").then(titleMap),
    listAll(api, "/products/?page_size=100").then(titleMap),
    listAll(api, "/expensecategories/?page_size=100").then(titleMap),
    db.categoryRule.findMany(),
  ]);

  let documents = 0;
  let deleted = 0;
  for (const kind of Object.keys(ENDPOINT) as FinanceKind[]) {
    const rows = await listAll(api, `/${ENDPOINT[kind]}/?page_size=100`);
    const existing = new Map((await db.financeDoc.findMany({ where: { kind }, select: { elorusId: true, contactName: true } })).map((d) => [d.elorusId, d]));
    for (const r of rows) {
      const h = headerFromRow(kind, r, docTypes);
      // Bill/expense lists have no supplier name; keep the one read from the full document.
      if (!h.contactName) h.contactName = existing.get(h.elorusId)?.contactName ?? "";
      await db.financeDoc.upsert({ where: { kind_elorusId: { kind, elorusId: h.elorusId } }, create: h, update: h });
    }
    documents += rows.length;
    const seen = new Set(rows.map((r) => String(r.id)));
    const gone = [...existing.keys()].filter((id) => !seen.has(id));
    if (gone.length) deleted += (await db.financeDoc.deleteMany({ where: { kind, elorusId: { in: gone } } })).count;
  }

  // Newest first, so a partial first run already fills the current year.
  const stale = (await db.financeDoc.findMany({ select: { id: true, kind: true, elorusId: true, modified: true, linesModified: true, contactName: true, contactId: true }, orderBy: { date: "desc" } }))
    .filter((d) => d.linesModified !== d.modified);
  const contactNames = new Map<string, string>();
  let detailed = 0;
  let failed = 0;
  let throttled = false;
  let i = 0;
  // Elorus has a daily request quota per API key, shared with invoicing. Read at most
  // `maxDetails` documents per run, one at a time, and stop at the first throttle (429) so
  // issuing invoices never runs out of requests.
  let spent = false;
  const worker = async () => {
    while (i < stale.length && Date.now() < deadline && !throttled && !spent && failed < 10) {
      const d = stale[i++];
      const full = await api.get<Row>(`/${ENDPOINT[d.kind]}/${d.elorusId}/`).catch((err) => {
        if (err instanceof BudgetSpent) spent = true;
        else if (String(err).includes(" 429 ")) throttled = true;
        else console.error("[finance] read failed", d.kind, d.elorusId, err);
        return null;
      });
      if (!full) {
        if (!throttled && !spent) failed++; // left stale: the next run reads it again
        continue;
      }
      const lines = linesFromDetail(d.kind, full, products, expenseCats, rules);
      let contactName = String(full.client_display_name ?? full.supplier_display_name ?? "") || d.contactName;
      if (!contactName && d.contactId) {
        if (!contactNames.has(d.contactId)) {
          const c = await api.get<Row>(`/contacts/${d.contactId}/`).catch(() => ({}) as Row); // counts toward the budget
          contactNames.set(d.contactId, String(c.display_name || c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || ""));
        }
        contactName = contactNames.get(d.contactId) ?? "";
      }
      await db.$transaction([
        db.financeLine.deleteMany({ where: { docId: d.id } }),
        db.financeLine.createMany({ data: lines.map((l) => ({ ...l, docId: d.id })) }),
        db.financeDoc.update({ where: { id: d.id }, data: { linesModified: d.modified, contactName } }),
      ]);
      detailed++;
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 1 }, worker));
  return { documents, detailed, remaining: stale.length - detailed, deleted, failed, throttled, requests: meter.requests };
}

/** Re-applies the category rules to every stored income line (after the rules change). */
export async function recategorize(db: Db = defaultDb) {
  const rules = await db.categoryRule.findMany();
  const lines = await db.financeLine.findMany({ where: { doc: { kind: { in: INCOME } } }, select: { id: true, title: true, sourceLabel: true, category: true } });
  const moves = new Map<string, string[]>();
  for (const l of lines) {
    const c = categorize(rules, l);
    if (c !== l.category) moves.set(c, [...(moves.get(c) ?? []), l.id]);
  }
  for (const [category, ids] of moves) await db.financeLine.updateMany({ where: { id: { in: ids } }, data: { category } });
  return { changed: [...moves.values()].reduce((s, ids) => s + ids.length, 0) };
}

export type FinanceRun = FinanceSyncResult | { skipped: "budget" | "throttled"; requestsLeft: number };

/** Requests Finance may still make in the last 24 hours, or 0 if Elorus throttled it in that time. */
export async function financeRequestsLeft(db: Db = defaultDb, now = new Date()) {
  const runs = await db.auditLog.findMany({ where: { action: "finance.sync", createdAt: { gt: new Date(now.getTime() - 86400_000) } }, select: { data: true } });
  const data = runs.map((r) => (r.data ?? {}) as { requests?: number; throttled?: boolean });
  if (data.some((d) => d.throttled)) return { left: 0, throttled: true };
  return { left: Math.max(0, FINANCE_DAILY_REQUESTS - data.reduce((s, d) => s + (d.requests ?? 0), 0)), throttled: false };
}

/**
 * The only entry point for the cron and "Sync Now": checks the daily budget, runs the sync and
 * records how many requests it spent (also when it fails part-way).
 */
export async function runFinanceSync(actor: string, opts: { db?: Db; api?: BooksReader; budgetMs?: number } = {}): Promise<FinanceRun> {
  const db = opts.db ?? defaultDb;
  const budget = await financeRequestsLeft(db);
  if (budget.throttled) return { skipped: "throttled", requestsLeft: 0 };
  if (budget.left < MIN_REQUESTS_TO_START) return { skipped: "budget", requestsLeft: budget.left };
  const meter = { requests: 0 };
  const log = (data: object) => db.auditLog.create({ data: { actor, action: "finance.sync", entity: "System", entityId: "finance", data } });
  try {
    const r = await syncFinance({ ...opts, db, maxRequests: budget.left, meter });
    await log(r);
    return r;
  } catch (err) {
    const throttled = String(err).includes(" 429 ");
    await log({ requests: meter.requests, throttled, error: String(err).slice(0, 300) });
    if (throttled) return { skipped: "throttled", requestsLeft: 0 };
    throw err;
  }
}

export { OTHER };
