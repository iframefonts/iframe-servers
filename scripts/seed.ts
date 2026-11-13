/**
 * Demo data covering every state: expiring soon, reminded, overdue, paid + invoiced,
 * missing tax details, EU reverse charge. Uses the mock Elorus contacts (mock-1…mock-5).
 * Run: pnpm db:seed   (wipes the database first; refuses on production URLs)
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createDb } from "../src/lib/db";
import { addPeriod, startOfAthensDay } from "../src/lib/dates";
import { DEFAULT_MOCK_CONTACTS } from "../src/lib/elorus/client";
import { cachedFields } from "../src/lib/elorus/sync";
import { amountsFor } from "../src/lib/money";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to seed a non-local database.");
  process.exit(1);
}
const db = createDb(url);
const today = startOfAthensDay(new Date());
const days = (n: number) => new Date(today.getTime() + n * 86400_000);

async function main() {
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog","WebhookEvent","Invoice","Payment","PaymentRequest","Reminder","PackageWebsite","HostingPackage","Plan","Website","Client","LoginToken" CASCADE`,
  );

  const [basic, business, pro, gr2] = await Promise.all([
    db.plan.create({ data: { name: "Basic", priceNetCents: 8000, periodMonths: 12 } }),
    db.plan.create({ data: { name: "Business", priceNetCents: 12000, periodMonths: 12 } }),
    db.plan.create({ data: { name: "Pro", priceNetCents: 20000, periodMonths: 12 } }),
    db.plan.create({ data: { name: ".gr domain (2 years)", priceNetCents: 3000, periodMonths: 24 } }),
  ]);

  const contact = (id: string) => DEFAULT_MOCK_CONTACTS.find((c) => c.id === id)!;
  const mkClient = (id: string, extra: object = {}) =>
    db.client.create({
      data: { ...cachedFields(contact(id)), elorusContactId: id, syncedAt: new Date(), invoiceType: contact(id).isCompany ? "TPY" : "APY", ...extra },
    });

  const biokip = await mkClient("mock-1");
  const mallatou = await mkClient("mock-2");
  const petra = await mkClient("mock-3", { language: "en", vatRegime: "eu_reverse_charge" });
  const tiptop = await mkClient("mock-4");
  const loukas = await mkClient("mock-5");

  async function pkg(clientId: string, domains: string[], planId: string, expiresAt: Date, extra: object = {}) {
    const sites = await Promise.all(domains.map((domain) => db.website.create({ data: { domain, clientId } })));
    const plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });
    return db.hostingPackage.create({
      data: {
        clientId,
        planId,
        startDate: addPeriod(expiresAt, -plan.periodMonths),
        expiresAt,
        websites: { create: sites.map((s) => ({ websiteId: s.id })) },
        ...extra,
      },
      include: { client: true, plan: true },
    });
  }

  /** A past renewal: request + payment + issued invoice, dated `paidAt`. */
  async function pastPayment(p: Awaited<ReturnType<typeof pkg>>, periodEnd: Date, paidAt: Date, provider: "viva" | "bank_transfer" = "viva") {
    const a = amountsFor(p.customPriceNetCents ?? p.plan.priceNetCents, p.client.vatRegime);
    const pr = await db.paymentRequest.create({
      data: { packageId: p.id, periodEnd, token: randomBytes(32).toString("base64url"), ...a, status: "paid", paidAt, expiresAt: addPeriod(periodEnd, 3) },
    });
    const pay = await db.payment.create({
      data: { paymentRequestId: pr.id, packageId: p.id, provider, transactionId: `seed_${randomBytes(6).toString("hex")}`, netCents: a.netCents, vatCents: a.vatCents, amountCents: a.amountCents, paidAt },
    });
    await db.invoice.create({
      data: { paymentId: pay.id, elorusInvoiceId: `seed-${pay.id}`, number: `${p.client.invoiceType}-${String(Math.floor(Math.random() * 900) + 100)}`, status: "issued", emailStatus: "sent", emailedAt: paidAt },
    });
  }

  // 1. Biokip: expires in 5 days, 30-day and 7-day reminders sent.
  const p1 = await pkg(biokip.id, ["biokip.gr"], business.id, days(5));
  for (const [kind, ago] of [["d30", 25], ["d7", 2]] as const) {
    await db.reminder.create({ data: { packageId: p1.id, kind, periodEnd: p1.expiresAt, status: "sent", attempts: 1, emailId: "seed", sentAt: days(-ago) } });
  }
  await pastPayment(p1, addPeriod(p1.expiresAt, -12), addPeriod(days(-3), -12));

  // 2. Mallatou (individual, ΑΠΥ): expires in 22 days, month reminder sent.
  const p2 = await pkg(mallatou.id, ["mallatou.gr"], basic.id, days(22));
  await db.reminder.create({ data: { packageId: p2.id, kind: "d30", periodEnd: p2.expiresAt, status: "sent", attempts: 1, emailId: "seed", sentAt: days(-8) } });

  // 3. Petra Hotel (EU, reverse charge, English): paid last month, renewed for a year.
  const p3 = await pkg(petra.id, ["petra-hotel.de"], pro.id, addPeriod(days(-20), 12));
  await pastPayment(p3, days(-20), days(-24));
  await pastPayment(p3, addPeriod(days(-20), -12), addPeriod(days(-26), -12));

  // 4. Tip-Top: overdue 6 days, missing tax office and address in Elorus.
  const p4 = await pkg(tiptop.id, ["tip-top.gr"], business.id, days(-6), { status: "expired" });
  await db.reminder.create({ data: { packageId: p4.id, kind: "d1", periodEnd: p4.expiresAt, status: "sent", attempts: 1, emailId: "seed", sentAt: days(-7) } });

  // 5. Hotel Loukas: two packages, history of payments for the charts.
  const p5 = await pkg(loukas.id, ["hotelloukas.gr"], pro.id, days(70));
  const p6 = await pkg(loukas.id, ["loukas-rooms.gr"], gr2.id, days(400));
  for (let y = 1; y <= 2; y++) await pastPayment(p5, addPeriod(days(70), -12 * y), addPeriod(days(60), -12 * y));
  await pastPayment(p6, addPeriod(days(400), -24), addPeriod(days(380), -24), "bank_transfer");

  // A few more paid renewals spread over this year for the income chart.
  const extra = [
    ["kouvelas.gr", -40, basic.id],
    ["sirrako.gr", -95, business.id],
    ["asyp.gr", -150, basic.id],
    ["peliva.gr", -200, pro.id],
    ["mynemesis.gr", -260, basic.id],
  ] as const;
  for (const [domain, ago, planId] of extra) {
    const p = await pkg(loukas.id, [domain], planId, addPeriod(days(ago), 12));
    await pastPayment(p, days(ago), days(ago - 3));
  }

  console.log("Seeded demo data: 5 clients, 11 packages.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
