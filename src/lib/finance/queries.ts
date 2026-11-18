import type { Db } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";

/** Net, VAT and gross in cents, plus how many documents. */
export type Money = { net: number; vat: number; gross: number; count: number };
const zero = (): Money => ({ net: 0, vat: 0, gross: 0, count: 0 });

type Doc = {
  kind: "invoice" | "credit_note" | "bill" | "expense";
  year: number;
  month: number;
  date: Date;
  netCents: number;
  vatCents: number;
  totalCents: number;
  typeLabel: string;
  contactId: string | null;
  contactName: string;
};

const isIncome = (d: Pick<Doc, "kind">) => d.kind === "invoice" || d.kind === "credit_note";
/** Credit notes reduce income. */
const sign = (d: Pick<Doc, "kind">) => (d.kind === "credit_note" ? -1 : 1);

export function add(m: Money, d: Doc) {
  const s = sign(d);
  m.net += s * d.netCents;
  m.vat += s * d.vatCents;
  m.gross += s * d.totalCents;
  m.count += 1;
}

export function totals(docs: Doc[]) {
  const income = zero();
  const out = zero();
  for (const d of docs) add(isIncome(d) ? income : out, d);
  return { income, out, result: income.net - out.net };
}

/** Groups by key, sums net (credit notes negative), sorted by net, biggest first. */
export function rank<T extends Doc>(docs: T[], key: (d: T) => string, name: (d: T) => string = key) {
  const map = new Map<string, { key: string; name: string; net: number; count: number }>();
  for (const d of docs) {
    const k = key(d);
    const e = map.get(k) ?? { key: k, name: name(d), net: 0, count: 0 };
    e.net += sign(d) * d.netCents;
    e.count += 1;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export type FinancePeriod = { year: number; month: number | null };

export async function getFinance({ year, month }: FinancePeriod, db: Db = defaultDb) {
  const inPeriod = (y: number) => ({ included: true, year: y, ...(month ? { month } : {}) });
  const select = { kind: true, year: true, month: true, date: true, netCents: true, vatCents: true, totalCents: true, typeLabel: true, contactId: true, contactName: true } as const;

  const [docs, prevDocs, yearDocs, byYearRaw, lines, outLines, clients, sync] = await Promise.all([
    db.financeDoc.findMany({ where: inPeriod(year), select }),
    db.financeDoc.findMany({ where: inPeriod(year - 1), select }),
    month ? db.financeDoc.findMany({ where: { included: true, year }, select }) : Promise.resolve(null),
    db.financeDoc.groupBy({ by: ["year", "kind"], where: { included: true }, _sum: { netCents: true } }),
    db.financeLine.findMany({ where: { doc: { ...inPeriod(year), kind: { in: ["invoice", "credit_note"] } } }, select: { category: true, netCents: true, doc: { select: { kind: true } } } }),
    db.financeLine.findMany({ where: { doc: { ...inPeriod(year), kind: { in: ["bill", "expense"] } } }, select: { category: true, netCents: true } }),
    db.client.findMany({ where: { elorusContactId: { not: null } }, select: { id: true, elorusContactId: true } }),
    db.financeDoc.aggregate({ _max: { syncedAt: true }, _count: true }),
  ]);
  // Documents whose lines haven't been read yet (first backfill, or changed in Elorus since).
  const [{ pending }] = await db.$queryRaw<{ pending: number }[]>`SELECT count(*)::int AS pending FROM "FinanceDoc" WHERE "linesModified" IS DISTINCT FROM "modified"`;

  const now = totals(docs);
  const prev = totals(prevDocs);

  // Bars: the 12 months of the year, or the days of the chosen month.
  const series = month
    ? Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => {
        const day = docs.filter((d) => d.date.getUTCDate() === i + 1);
        return { key: String(i + 1), ...totals(day) };
      })
    : Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), ...totals(docs.filter((d) => d.month === i + 1)) }));

  const years = [...new Set(byYearRaw.map((r) => r.year))].sort((a, b) => a - b);
  const byYear = years.map((y) => {
    const of = (k: string) => byYearRaw.find((r) => r.year === y && r.kind === k)?._sum.netCents ?? 0;
    return { year: y, income: of("invoice") - of("credit_note"), out: of("bill") + of("expense") };
  });

  const catMap = new Map<string, number>();
  for (const l of lines) catMap.set(l.category, (catMap.get(l.category) ?? 0) + sign(l.doc) * l.netCents);
  const byCategory = [...catMap].map(([name, net]) => ({ name, net })).sort((a, b) => b.net - a.net);

  const outCatMap = new Map<string, number>();
  for (const l of outLines) outCatMap.set(l.category, (outCatMap.get(l.category) ?? 0) + l.netCents);
  const outByCategory = [...outCatMap].map(([name, net]) => ({ name, net })).sort((a, b) => b.net - a.net);

  const income = docs.filter(isIncome);
  const outgoings = docs.filter((d) => !isIncome(d));
  const localClient = new Map(clients.map((c) => [c.elorusContactId!, c.id]));
  const topClients = rank(income, (d) => d.contactId ?? d.contactName, (d) => d.contactName || "Unknown client")
    .slice(0, 10)
    .map((c) => ({ ...c, clientId: localClient.get(c.key) ?? null, share: now.income.net ? c.net / now.income.net : 0 }));
  const clientCount = new Set(income.map((d) => d.contactId ?? d.contactName)).size;

  return {
    year,
    month,
    now,
    prev,
    series,
    byYear,
    years,
    byCategory,
    byType: rank(income, (d) => d.typeLabel),
    topClients,
    clientCount,
    outBySupplier: rank(outgoings, (d) => d.contactId ?? d.contactName, (d) => d.contactName || "No supplier"),
    outByType: rank(outgoings, (d) => d.typeLabel),
    outByCategory,
    yearTotals: yearDocs ? totals(yearDocs) : now,
    lastSync: sync._max.syncedAt,
    documents: sync._count,
    pending,
  };
}

export type Finance = Awaited<ReturnType<typeof getFinance>>;
