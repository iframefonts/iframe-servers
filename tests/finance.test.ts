import { beforeEach, describe, expect, it } from "vitest";
import { categorize, normalize } from "@/lib/finance/categories";
import { getFinance } from "@/lib/finance/queries";
import { FINANCE_DAILY_REQUESTS, financeRequestsLeft, recategorize, runFinanceSync, syncFinance, type BooksReader } from "@/lib/finance/sync";
import { db } from "./helpers";

const RULES = [
  { pattern: "domain", category: "Domains", position: 10 },
  { pattern: "server", category: "Hosting", position: 20 },
  { pattern: "ταυτοτητ", category: "Branding", position: 30 },
  { pattern: "ιστοσελ", category: "Websites", position: 40 },
  { pattern: "font", category: "Fonts", position: 50 },
];

describe("categorize", () => {
  it("ignores case, accents and final sigma", () => {
    expect(normalize("Σχεδιασμός Εταιρικής ΤΑΥΤΌΤΗΤΑΣ")).toBe("σχεδιασμοσ εταιρικησ ταυτοτητασ");
    expect(categorize(RULES, { title: "Σχεδιασμός Εταιρικής Ταυτότητας" })).toBe("Branding");
  });

  it("takes the first rule in order, so 'Domain … ιστοσελίδας' is a domain", () => {
    expect(categorize(RULES, { title: "Ανανέωση Domain Name ιστοσελίδας", sourceLabel: null })).toBe("Domains");
    expect(categorize(RULES, { title: "Σχεδιασμός & Κατασκευή ιστοσελίδας" })).toBe("Websites");
  });

  it("checks the Elorus product before the line text", () => {
    expect(categorize(RULES, { title: "Aalto (κατασκευή ιστοσελίδας)", sourceLabel: "Ανανέωση Server ιστοσελίδας" })).toBe("Hosting");
  });

  it("falls back to the product name, then Other", () => {
    expect(categorize(RULES, { title: "Φυλλάδια", sourceLabel: "Φυλλάδια Α5" })).toBe("Φυλλάδια Α5");
    expect(categorize(RULES, { title: "Μετάδοση σποτ" })).toBe("Other");
  });
});

/** A read-only fake of the Elorus endpoints the sync uses. */
function fakeElorus(data: { invoices?: object[]; creditnotes?: object[]; bills?: object[]; expenses?: object[]; details?: Record<string, object> }) {
  const calls: string[] = [];
  const api: BooksReader = {
    async get<T>(path: string) {
      calls.push(path);
      const detail = path.match(/^\/(\w+)\/(\w+)\/$/);
      if (detail && detail[1] !== "contacts") return (data.details?.[detail[2]] ?? { items: [] }) as T;
      if (detail) return { display_name: "Supplier from contacts" } as T;
      const kind = path.split("/")[1];
      const lists: Record<string, object[]> = {
        documenttypes: [
          { id: "dt-tpy", title: "ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ" },
          { id: "dt-open", title: "Προηγούμενα Υπόλοιπα" },
        ],
        products: [{ id: "p-server", title: "Ανανέωση Server ιστοσελίδας" }],
        expensecategories: [{ id: "ec-rent", title: "Ενοίκιο & Μισθώσεις" }],
        invoices: data.invoices ?? [],
        creditnotes: data.creditnotes ?? [],
        bills: data.bills ?? [],
        expenses: data.expenses ?? [],
      };
      return { next: null, results: lists[kind] ?? [] } as T;
    },
  };
  return { api, calls };
}

const inv = (id: string, over: object = {}) => ({
  id,
  number: id,
  date: "2026-03-10",
  status: "paid",
  draft: false,
  documenttype: "dt-tpy",
  mydata_document_type: "2.1",
  client: "c-1",
  client_display_name: "Biokip ΙΚΕ",
  exchange_rate: "1.000000",
  net: "100.00",
  total: "124.00",
  modified: "2026-03-10T10:00:00Z",
  ...over,
});

async function resetFinance() {
  await db.$executeRawUnsafe(`TRUNCATE "FinanceLine","FinanceDoc","CategoryRule","Client" CASCADE`);
  await db.categoryRule.createMany({ data: RULES });
}

describe("syncFinance + getFinance", () => {
  beforeEach(resetFinance);

  it("counts paid and issued invoices, subtracts credit notes, skips drafts, void and opening balances", async () => {
    const { api } = fakeElorus({
      invoices: [
        inv("1"),
        inv("2", { date: "2026-04-02", net: "200.00", total: "248.00", client: "c-2", client_display_name: "Hotel Loukas" }),
        inv("3", { status: "void" }),
        inv("4", { draft: true, status: "draft" }),
        inv("5", { documenttype: "dt-open", mydata_document_type: "" }),
        inv("6", { date: "2024-04-19", net: "7500.00", total: "7500.00", exchange_rate: "0.937460", mydata_document_type: "2.3" }),
        inv("7", { date: "2025-03-01", net: "50.00", total: "62.00" }),
      ],
      creditnotes: [inv("cn1", { mydata_document_type: "5.1", net: "40.00", total: "49.60", date: "2026-04-20" })],
      bills: [{ id: "b1", date: "2026-04-05", status: "issued", supplier: "s-1", net: "500.00", total: "620.00", exchange_rate: "1.0", modified: "x" }],
      details: {
        "1": { items: [{ title: "Σχεδιασμός Εταιρικής Ταυτότητας", product: null, item_net: "100.00" }] },
        "2": { items: [{ title: "x", product: "p-server", item_net: "120.00" }, { title: "Aalto Font", product: null, item_net: "80.00" }] },
        cn1: { client_display_name: "Biokip ΙΚΕ", items: [{ title: "Σχεδιασμός Εταιρικής Ταυτότητας", item_net: "40.00" }] },
        b1: { supplier_display_name: "Τυπογραφείο Α", items: [{ description: "Εκτυπώσεις", expense_category: "ec-rent", item_net: "500.00" }] },
      },
    });
    const r = await syncFinance({ db, api });
    expect(r).toMatchObject({ documents: 9, remaining: 0, deleted: 0 });

    const f = await getFinance({ year: 2026, month: null }, db);
    // 100 + 200 − 40 credit note
    expect(f.now.income).toEqual({ net: 26000, vat: 6240, gross: 32240, count: 3 });
    expect(f.now.out).toMatchObject({ net: 50000, count: 1 });
    expect(f.now.result).toBe(26000 - 50000);
    expect(f.prev.income.net).toBe(5000);
    expect(f.series[3]).toMatchObject({ key: "4", income: { net: 16000 }, out: { net: 50000 } });

    expect(Object.fromEntries(f.byCategory.map((c) => [c.name, c.net]))).toEqual({ Hosting: 12000, Fonts: 8000, Branding: 6000 });
    expect(f.byType.map((t) => [t.name, t.net])).toEqual([
      ["Service invoice ΤΠΥ (2.1)", 30000],
      ["Credit note (5.1)", -4000],
    ]);
    expect(f.topClients.map((c) => [c.name, c.net])).toEqual([
      ["Hotel Loukas", 20000],
      ["Biokip ΙΚΕ", 6000],
    ]);
    expect(f.outBySupplier[0]).toMatchObject({ name: "Τυπογραφείο Α", net: 50000 });
    expect(f.outByCategory).toEqual([{ name: "Ενοίκιο & Μισθώσεις", net: 50000 }]);

    // Foreign currency is converted with the document's exchange rate: 7500 USD × 0.93746
    expect((await getFinance({ year: 2024, month: 4 }, db)).now.income.net).toBe(703095);
    expect(f.byYear.map((y) => [y.year, y.income])).toEqual([
      [2024, 703095],
      [2025, 5000],
      [2026, 26000],
    ]);
  });

  it("filters by month", async () => {
    const { api } = fakeElorus({ invoices: [inv("1"), inv("2", { date: "2026-04-02", net: "200.00", total: "248.00" })] });
    await syncFinance({ db, api });
    const march = await getFinance({ year: 2026, month: 3 }, db);
    expect(march.now.income.net).toBe(10000);
    expect(march.series).toHaveLength(31);
    expect(march.series[9].income.net).toBe(10000); // 10 March
  });

  it("re-reads lines only when Elorus says a document changed, and drops deleted ones", async () => {
    const first = fakeElorus({ invoices: [inv("1"), inv("2")] });
    await syncFinance({ db, api: first.api });
    expect(first.calls.filter((c) => c.startsWith("/invoices/") && !c.includes("?"))).toHaveLength(2);

    const second = fakeElorus({ invoices: [inv("1", { modified: "2026-03-11T00:00:00Z", net: "150.00", total: "186.00" })] });
    const r = await syncFinance({ db, api: second.api });
    expect(r).toMatchObject({ detailed: 1, deleted: 1 });
    expect(second.calls).toContain("/invoices/1/");
    expect((await getFinance({ year: 2026, month: null }, db)).now.income.net).toBe(15000);
  });

  it("re-categorises stored lines when the rules change", async () => {
    const { api } = fakeElorus({ invoices: [inv("1")], details: { "1": { items: [{ title: "Μετάδοση σποτ", item_net: "100.00" }] } } });
    await syncFinance({ db, api });
    expect((await getFinance({ year: 2026, month: null }, db)).byCategory).toEqual([{ name: "Other", net: 10000 }]);
    await db.categoryRule.create({ data: { pattern: "σποτ", category: "Advertising", position: 5 } });
    expect(await recategorize(db)).toEqual({ changed: 1 });
    expect((await getFinance({ year: 2026, month: null }, db)).byCategory).toEqual([{ name: "Advertising", net: 10000 }]);
  });
});

describe("Elorus request quota", () => {
  beforeEach(async () => {
    await resetFinance();
    await db.$executeRawUnsafe(`TRUNCATE "AuditLog"`);
  });
  // The fake answers 3 lookup lists + 4 document lists = 7 requests before any document is read.
  const LISTING = 7;

  it("never makes more requests than allowed, and continues next time", async () => {
    const { api, calls } = fakeElorus({ invoices: [inv("1"), inv("2"), inv("3")] });
    expect(await syncFinance({ db, api, maxRequests: LISTING + 2 })).toMatchObject({ detailed: 2, remaining: 1, requests: LISTING + 2 });
    expect(calls).toHaveLength(LISTING + 2);
    expect(await syncFinance({ db, api, maxRequests: LISTING + 2 })).toMatchObject({ detailed: 1, remaining: 0 });
  });

  it("stops at the first 429 so invoicing keeps its requests", async () => {
    const { api } = fakeElorus({ invoices: [inv("1"), inv("2"), inv("3")] });
    let reads = 0;
    const throttling: BooksReader = {
      get: async <T,>(path: string) => {
        if (/^\/invoices\/\d\/$/.test(path) && ++reads > 1) throw new Error(`Elorus GET ${path}: 429 {"detail":"Request was throttled."}`);
        return api.get<T>(path);
      },
    };
    const r = await syncFinance({ db, api: throttling });
    expect(r).toMatchObject({ detailed: 1, remaining: 2, throttled: true, failed: 0 });
    expect(reads).toBe(2);
  });

  it("spends at most the daily budget across runs, then doesn't call Elorus at all", async () => {
    const many = Array.from({ length: 200 }, (_, k) => inv(String(k + 1)));
    const { api, calls } = fakeElorus({ invoices: many });
    const first = await runFinanceSync("test", { db, api });
    expect(first).toMatchObject({ requests: FINANCE_DAILY_REQUESTS, detailed: FINANCE_DAILY_REQUESTS - LISTING });
    expect(await financeRequestsLeft(db)).toEqual({ left: 0, throttled: false });

    const before = calls.length;
    expect(await runFinanceSync("test", { db, api })).toEqual({ skipped: "budget", requestsLeft: 0 });
    expect(calls.length).toBe(before);
  });

  it("pauses Finance for 24 hours after Elorus throttles it once", async () => {
    const throttled: BooksReader = { get: async () => { throw new Error("Elorus GET /documenttypes/: 429 throttled"); } };
    expect(await runFinanceSync("test", { db, api: throttled })).toEqual({ skipped: "throttled", requestsLeft: 0 });
    const { api, calls } = fakeElorus({ invoices: [inv("1")] });
    expect(await runFinanceSync("test", { db, api })).toEqual({ skipped: "throttled", requestsLeft: 0 });
    expect(calls).toHaveLength(0);
    expect(await financeRequestsLeft(db, new Date(Date.now() + 86400_000 + 1000))).toMatchObject({ throttled: false });
  });
});
