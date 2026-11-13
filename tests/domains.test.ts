import { beforeEach, describe, expect, it } from "vitest";
import { athensDay, toDateInput } from "@/lib/dates";
import { MockElorus } from "@/lib/elorus/client";
import { MemoryMailer } from "@/lib/email/send";
import { issueInvoice } from "@/lib/invoices/issue";
import { recordPayment } from "@/lib/payments/record";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { runReminders } from "@/lib/reminders/engine";
import { parseLines } from "@/lib/renewal";
import { at, db, makePackage, reset } from "./helpers";

async function withGrDomain() {
  const made = await makePackage({ expiresAt: athensDay(2026, 12, 31) }); // hosting €120 net / 12 months
  const domainPlan = await db.plan.create({ data: { name: ".gr domain", kind: "domain", priceNetCents: 3000, periodMonths: 24 } });
  const domain = await db.packageDomain.create({
    data: { packageId: made.pkg.id, websiteId: made.site.id, planId: domainPlan.id, expiresAt: athensDay(2026, 12, 31) },
  });
  return { ...made, domain };
}

async function pay(packageId: string, txn: string, paidAt: Date) {
  const pr = await getOrCreatePaymentRequest(packageId, { db });
  const r = await recordPayment({ provider: "viva", transactionId: txn, paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt }, db);
  return { pr, r };
}

describe("hosting + .gr domain on the same date", () => {
  beforeEach(reset);

  it("adds the domain every 2nd year and moves each item by its own period", async () => {
    const { pkg, domain } = await withGrDomain();

    // 2026: hosting + domain = €150 net, €186 with VAT
    const y1 = await pay(pkg.id, "t1", at(2026, 12, 20));
    expect(y1.pr.amountCents).toBe(18600);
    expect(parseLines(y1.pr.lines)!.map((l) => l.kind)).toEqual(["hosting", "domain"]);
    expect(toDateInput((await db.hostingPackage.findUniqueOrThrow({ where: { id: pkg.id } })).expiresAt)).toBe("2027-12-31");
    expect(toDateInput((await db.packageDomain.findUniqueOrThrow({ where: { id: domain.id } })).expiresAt)).toBe("2028-12-31");

    // 2027: hosting only
    const y2 = await pay(pkg.id, "t2", at(2027, 12, 20));
    expect(y2.pr.amountCents).toBe(14880);
    expect(parseLines(y2.pr.lines)!.map((l) => l.kind)).toEqual(["hosting"]);
    expect(toDateInput((await db.packageDomain.findUniqueOrThrow({ where: { id: domain.id } })).expiresAt)).toBe("2028-12-31");

    // 2028: domain is due again
    const y3 = await getOrCreatePaymentRequest(pkg.id, { db });
    expect(y3.amountCents).toBe(18600);
  });

  it("issues one Elorus invoice with a hosting line and a domain line", async () => {
    const { pkg } = await withGrDomain();
    const { r } = await pay(pkg.id, "t1", at(2026, 12, 20));
    if (r.outcome !== "recorded") throw new Error(r.outcome);
    const elorus = new MockElorus();
    await issueInvoice(r.paymentId, { db, elorus, mailer: new MemoryMailer() });
    const lines = elorus.invoices[0].lines!;
    expect(lines.map((l) => l.netCents)).toEqual([12000, 3000]);
    expect(lines[1].title).toMatch(/^Domain name acme-.*\.gr, 31 Dec 2026 – 31 Dec 2028$/);
  });

  it("says in the reminder that the domain renews too", async () => {
    await withGrDomain();
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 1) });
    const r = mailer.sent.find((m) => m.to.includes("info@acme.gr"))!;
    expect(r.subject).toContain("ανανεώνεται");
    const extras = (r.react.props as { extras: string[] }).extras;
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatch(/^Περιλαμβάνει και την ανανέωση του domain acme-.*\.gr για 2 έτη\.$/);
  });
});
