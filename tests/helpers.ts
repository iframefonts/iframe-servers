import { createDb } from "@/lib/db";
import { athensDay } from "@/lib/dates";

export const db = createDb(process.env.TEST_DATABASE_URL);

export async function reset() {
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog","WebhookEvent","Invoice","Payment","PaymentRequest","Reminder","PackageWebsite","HostingPackage","Plan","Website","Client","LoginToken" CASCADE`,
  );
}

export async function makePackage(opts: {
  expiresAt: Date;
  regime?: "domestic" | "eu_reverse_charge" | "non_eu";
  priceNetCents?: number;
  periodMonths?: number;
  emails?: string[];
  linked?: boolean;
}) {
  const client = await db.client.create({
    data: {
      name: "ACME ΙΚΕ",
      elorusContactId: opts.linked === false ? null : "mock-1",
      vatNumber: "801234567",
      taxOffice: "Πρέβεζας",
      address: "Ελ. Βενιζέλου 12",
      emails: opts.emails ?? ["info@acme.gr"],
      vatRegime: opts.regime ?? "domestic",
    },
  });
  const plan = await db.plan.create({
    data: { name: "Basic", priceNetCents: opts.priceNetCents ?? 12000, periodMonths: opts.periodMonths ?? 12 },
  });
  const site = await db.website.create({ data: { domain: `acme-${Math.random().toString(36).slice(2, 7)}.gr`, clientId: client.id } });
  const pkg = await db.hostingPackage.create({
    data: {
      clientId: client.id,
      planId: plan.id,
      startDate: athensDay(2025, 12, 1),
      expiresAt: opts.expiresAt,
      websites: { create: [{ websiteId: site.id }] },
    },
  });
  return { client, plan, site, pkg };
}

/** 09:00 Athens on the given day. */
export function at(year: number, month: number, day: number) {
  return new Date(athensDay(year, month, day).getTime() + 9 * 3600_000);
}
