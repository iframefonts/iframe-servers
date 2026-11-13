import { beforeEach, describe, expect, it } from "vitest";
import { athensDay, toDateInput } from "@/lib/dates";
import { MockElorus } from "@/lib/elorus/client";
import { MemoryMailer } from "@/lib/email/send";
import { issueInvoice } from "@/lib/invoices/issue";
import { amountsFor } from "@/lib/money";
import { recordPayment } from "@/lib/payments/record";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { db, makePackage, reset } from "./helpers";

const expiry = athensDay(2026, 12, 31);

describe("VAT", () => {
  it("uses the client's regime", () => {
    expect(amountsFor(12000, "domestic")).toMatchObject({ vatCents: 2880, amountCents: 14880, vatRate: 24 });
    expect(amountsFor(12000, "eu_reverse_charge")).toMatchObject({ vatCents: 0, amountCents: 12000 });
    expect(amountsFor(12000, "non_eu")).toMatchObject({ vatCents: 0 });
  });
});

describe("payment requests", () => {
  beforeEach(reset);
  it("re-snapshots the amount when the price changes while open", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    const a = await getOrCreatePaymentRequest(pkg.id, { db });
    await db.hostingPackage.update({ where: { id: pkg.id }, data: { customPriceNetCents: 15000 } });
    const b = await getOrCreatePaymentRequest(pkg.id, { db });
    expect(b.id).toBe(a.id);
    expect(b.token).toBe(a.token);
    expect(b.amountCents).toBe(18600);
  });
});

describe("recordPayment", () => {
  beforeEach(reset);

  it("extends from the old expiry and reactivates an expired package", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    await db.hostingPackage.update({ where: { id: pkg.id }, data: { status: "expired" } });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    const r = await recordPayment({ provider: "viva", transactionId: "v1", paymentRequestId: pr.id, amountCents: 14880, paidAt: new Date("2027-01-10T10:00:00Z") }, db);
    expect(r.outcome).toBe("recorded");
    const after = await db.hostingPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(toDateInput(after.expiresAt)).toBe("2027-12-31");
    expect(after.status).toBe("active");
  });

  it("2-year plans extend by 24 months", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry, periodMonths: 24 });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    await recordPayment({ provider: "viva", transactionId: "v2", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: new Date() }, db);
    expect(toDateInput((await db.hostingPackage.findUniqueOrThrow({ where: { id: pkg.id } })).expiresAt)).toBe("2028-12-31");
  });

  it("the same webhook delivered twice does nothing the second time", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    const input = { provider: "viva" as const, transactionId: "v2", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: new Date(), webhookEventId: "evt_1" };
    expect((await recordPayment(input, db)).outcome).toBe("recorded");
    expect((await recordPayment(input, db)).outcome).toBe("duplicate");
    expect(await db.payment.count()).toBe(1);
  });

  it("paying the same link from two tabs at the same time renews once and flags the other for refund", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    const results = await Promise.all([
      recordPayment({ provider: "viva", transactionId: "v1", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: new Date() }, db),
      recordPayment({ provider: "viva", transactionId: "v2", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: new Date() }, db),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["needs_refund", "recorded"]);
    const after = await db.hostingPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(toDateInput(after.expiresAt)).toBe("2027-12-31"); // extended once, not twice
    expect(await db.invoice.count()).toBe(1);
  });

  it("a wrong amount is never treated as a renewal", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    const r = await recordPayment({ provider: "viva", transactionId: "v1", paymentRequestId: pr.id, amountCents: 100, paidAt: new Date() }, db);
    expect(r.outcome).toBe("needs_refund");
    expect((await db.paymentRequest.findUniqueOrThrow({ where: { id: pr.id } })).status).toBe("open");
  });
});

describe("issueInvoice", () => {
  beforeEach(reset);

  async function paid(opts: Parameters<typeof makePackage>[0]) {
    const { pkg } = await makePackage(opts);
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    const r = await recordPayment({ provider: "viva", transactionId: `s-${pkg.id}`, paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: new Date() }, db);
    if (r.outcome !== "recorded") throw new Error("not recorded");
    return r.paymentId;
  }

  it("issues, records payment, emails, and resumes after a failure without a second invoice", async () => {
    const paymentId = await paid({ expiresAt: expiry });
    const elorus = new MockElorus();
    const mailer = new MemoryMailer();
    elorus.failNext = 1; // contact refresh fails once
    await expect(issueInvoice(paymentId, { db, elorus, mailer })).rejects.toThrow(/503/);
    const inv = await issueInvoice(paymentId, { db, elorus, mailer });
    expect(inv.status).toBe("issued");
    expect(inv.emailStatus).toBe("sent");
    expect(elorus.invoices).toHaveLength(1);
    expect(elorus.invoices[0]).toMatchObject({ paid: true, emailedTo: ["info@biokip.gr"] });
    await issueInvoice(paymentId, { db, elorus, mailer }); // repeat: no-op
    expect(elorus.invoices).toHaveLength(1);
  });

  it("stops and alerts the team when Elorus is missing tax details", async () => {
    const paymentId = await paid({ expiresAt: expiry, linked: false });
    const mailer = new MemoryMailer();
    const inv = await issueInvoice(paymentId, { db, elorus: new MockElorus(), mailer });
    expect(inv.status).not.toBe("issued");
    const stored = await db.invoice.findUniqueOrThrow({ where: { paymentId } });
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toMatch(/Elorus link/);
    expect(mailer.sent.some((m) => m.subject.startsWith("Invoice needs you"))).toBe(true);
  });

  it("uses the reverse-charge series for EU businesses", async () => {
    const paymentId = await paid({ expiresAt: expiry, regime: "eu_reverse_charge" });
    const elorus = new MockElorus();
    await issueInvoice(paymentId, { db, elorus, mailer: new MemoryMailer() });
    expect(elorus.invoices[0].number).toMatch(/^TPY-EU-/);
  });
});
