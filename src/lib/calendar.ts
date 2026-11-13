import { db as defaultDb, type Db } from "@/lib/db";
import { athensDayOfMonth, athensMonthKey, monthRange, monthStart } from "@/lib/dates";
import { amountsFor } from "@/lib/money";
import { packageStatus, type Status } from "@/lib/status";

export type CalendarEntry = {
  key: string;
  packageId: string;
  clientId: string;
  clientName: string;
  domains: string;
  date: Date;
  day: number;
  amountCents: number;
  status: Status;
  /** true = this period is already paid */
  paid: boolean;
};

export type CalendarMonth = {
  key: string;
  entries: CalendarEntry[];
  totalCents: number;
  paidCents: number;
  openCents: number;
};

const include = {
  client: true,
  plan: true,
  websites: { include: { website: true } },
  reminders: true,
  payments: { include: { invoice: true } },
} as const;

/**
 * Renewals per month. A month shows:
 *  - packages whose current expiry falls in it (status from the shared vocabulary), and
 *  - periods that ended in it and were already paid (otherwise they'd vanish, because paying moves
 *    the package's expiry a year forward).
 * Cancelled packages are left out.
 */
export async function getCalendar(startKey: string, months: number, opts: { db?: Db; now?: Date } = {}): Promise<CalendarMonth[]> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const keys = monthRange(startKey, months);
  const from = monthStart(keys[0]);
  const to = monthStart(monthRange(keys[keys.length - 1], 2)[1]);

  const [current, paidPeriods] = await Promise.all([
    db.hostingPackage.findMany({
      where: { status: { not: "cancelled" }, expiresAt: { gte: from, lt: to } },
      include,
    }),
    db.paymentRequest.findMany({
      where: { status: "paid", periodEnd: { gte: from, lt: to }, package: { status: { not: "cancelled" } } },
      include: { package: { include } },
    }),
  ]);

  const domainsOf = (p: { websites: { website: { domain: string } }[]; plan: { name: string } }) =>
    p.websites.map((w) => w.website.domain).join(", ") || p.plan.name;

  const entries: CalendarEntry[] = [];
  const seen = new Set<string>();
  for (const pr of paidPeriods) {
    const p = pr.package;
    seen.add(`${p.id}:${+pr.periodEnd}`);
    entries.push({
      key: `pr-${pr.id}`,
      packageId: p.id,
      clientId: p.clientId,
      clientName: p.client.name,
      domains: domainsOf(p),
      date: pr.periodEnd,
      day: athensDayOfMonth(pr.periodEnd),
      amountCents: pr.amountCents,
      status: { label: "Paid", tone: "done", icon: "check" },
      paid: true,
    });
  }
  for (const p of current) {
    if (seen.has(`${p.id}:${+p.expiresAt}`)) continue;
    entries.push({
      key: `pkg-${p.id}`,
      packageId: p.id,
      clientId: p.clientId,
      clientName: p.client.name,
      domains: domainsOf(p),
      date: p.expiresAt,
      day: athensDayOfMonth(p.expiresAt),
      amountCents: amountsFor(p.customPriceNetCents ?? p.plan.priceNetCents, p.client.vatRegime).amountCents,
      status: packageStatus(p, now).primary,
      paid: false,
    });
  }

  return keys.map((key) => {
    const list = entries
      .filter((e) => athensMonthKey(e.date) === key)
      .sort((a, b) => a.day - b.day || a.domains.localeCompare(b.domains));
    const paidCents = list.filter((e) => e.paid).reduce((s, e) => s + e.amountCents, 0);
    const totalCents = list.reduce((s, e) => s + e.amountCents, 0);
    return { key, entries: list, totalCents, paidCents, openCents: totalCents - paidCents };
  });
}
