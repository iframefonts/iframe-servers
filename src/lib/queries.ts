import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { athensDay, athensYear, daysLeft, formatShortDate } from "@/lib/dates";
import { missingInvoiceDetails } from "@/lib/elorus/client";
import { formatEur } from "@/lib/money";

export const packageInclude = {
  client: true,
  plan: true,
  websites: { include: { website: true } },
  reminders: { orderBy: { createdAt: "desc" as const } },
  payments: { include: { invoice: true }, orderBy: { paidAt: "desc" as const } },
} as const;

export const domainsOf = (p: { websites: { website: { domain: string } }[] }) =>
  p.websites.map((w) => w.website.domain).join(", ") || "No website";

export type AttentionItem = {
  key: string;
  severity: 1 | 2 | 3; // 1 = most urgent
  title: string;
  detail: string;
  href: string;
  action: string;
};

/** Everything that needs a person, most urgent first. */
export const getAttention = cache(async () => {
  const now = new Date();
  const items: AttentionItem[] = [];

  const invoices = await db.invoice.findMany({
    where: { OR: [{ status: "failed" }, { emailStatus: "failed" }, { status: "pending", createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } }] },
    include: { payment: { include: { package: { include: { client: true } } } } },
  });
  for (const inv of invoices) {
    const failed = inv.status === "failed" || inv.emailStatus === "failed";
    items.push({
      key: `inv-${inv.id}`,
      severity: 1,
      title: failed ? `Invoice failed: ${inv.payment.package.client.name}` : `Paid, invoice not issued yet: ${inv.payment.package.client.name}`,
      detail: inv.lastError ?? `${formatEur(inv.payment.amountCents, "en")} paid ${formatShortDate(inv.payment.paidAt, "en")}`,
      href: `/renewals/${inv.payment.packageId}`,
      action: "Retry Invoice",
    });
  }

  const refunds = await db.payment.findMany({ where: { status: "needs_refund" }, include: { package: { include: { client: true } } } });
  for (const p of refunds) {
    items.push({
      key: `refund-${p.id}`,
      severity: 1,
      title: `Needs refund: ${p.package.client.name}`,
      detail: `${formatEur(p.amountCents, "en")} via ${p.provider}, transaction ${p.transactionId}. Refund it in Viva, then mark it refunded.`,
      href: `/renewals/${p.packageId}`,
      action: "Open",
    });
  }

  const failedReminders = await db.reminder.findMany({
    where: { status: "failed" },
    include: { package: { include: { client: true, websites: { include: { website: true } } } } },
  });
  for (const r of failedReminders) {
    items.push({
      key: `rem-${r.id}`,
      severity: 2,
      title: `Reminder not sent: ${domainsOf(r.package)}`,
      detail: r.lastError ?? "Send failed",
      href: `/renewals/${r.packageId}`,
      action: "Open",
    });
  }

  const pkgs = await db.hostingPackage.findMany({
    where: { status: { in: ["active", "expired"] } },
    include: { client: true, websites: { include: { website: true } }, paymentRequests: true },
    orderBy: { expiresAt: "asc" },
  });
  for (const p of pkgs) {
    const d = daysLeft(p.expiresAt, now);
    if (p.status === "expired" && d <= -3) {
      items.push({
        key: `over-${p.id}`,
        severity: 2,
        title: `Overdue ${-d} days: ${domainsOf(p)}`,
        detail: `${p.client.name} · expired ${formatShortDate(p.expiresAt, "en")}`,
        href: `/renewals/${p.id}`,
        action: "Open",
      });
    } else if (p.status === "active" && d >= 0 && d <= 7) {
      items.push({
        key: `soon-${p.id}`,
        severity: 3,
        title: `${d === 0 ? "Expires today" : d === 1 ? "Expires tomorrow" : `Expires in ${d} days`}: ${domainsOf(p)}`,
        detail: `${p.client.name} · not paid yet${p.remindersEnabled ? "" : " · reminders paused"}`,
        href: `/renewals/${p.id}`,
        action: "Open",
      });
    }
  }

  // Setup gaps are grouped so an import of 160 clients is one row, not 160.
  const clientsWithPkgs = new Map(pkgs.map((p) => [p.client.id, p.client]));
  const unlinked = [...clientsWithPkgs.values()].filter((c) => !c.elorusContactId);
  const incomplete = [...clientsWithPkgs.values()].filter((c) => c.elorusContactId && missingInvoiceDetails(c).length);
  if (unlinked.length > 3) {
    items.push({
      key: "unlinked",
      severity: 3,
      title: `${unlinked.length} clients not linked to Elorus`,
      detail: "Invoices can't be issued until each is linked. Most come from the sheet import.",
      href: "/clients?filter=unlinked",
      action: "Review",
    });
  } else {
    for (const c of unlinked) {
      items.push({ key: `client-${c.id}`, severity: 3, title: `Not linked to Elorus: ${c.name}`, detail: "Link the client to an Elorus contact so invoices can be issued.", href: `/clients/${c.id}`, action: "Link to Elorus" });
    }
  }
  for (const c of incomplete) {
    items.push({
      key: `client-${c.id}`,
      severity: 3,
      title: `Missing tax details: ${c.name}`,
      detail: `Add in Elorus: ${missingInvoiceDetails(c).join(", ")}. Reminders still go out; invoicing waits.`,
      href: `/clients/${c.id}`,
      action: "Open Client",
    });
  }
  const unpriced = await db.hostingPackage.count({
    where: { status: "active", customPriceNetCents: null, plan: { priceNetCents: 0 } },
  });
  if (unpriced) {
    items.push({
      key: "unpriced",
      severity: 3,
      title: `${unpriced} package${unpriced === 1 ? " has" : "s have"} no price`,
      detail: "Choose a plan or a custom price, then resume reminders.",
      href: "/renewals?filter=setup",
      action: "Review",
    });
  }

  items.sort((a, b) => a.severity - b.severity);
  return { items };
});

/** The four Today cards. */
export async function getTodayCards() {
  const now = new Date();
  const year = athensYear(now);
  const pkgs = await db.hostingPackage.findMany({
    where: { status: { in: ["active", "expired"] } },
    include: { plan: true, client: true },
  });
  const price = (p: (typeof pkgs)[number]) => p.customPriceNetCents ?? p.plan.priceNetCents;
  const overdue = pkgs.filter((p) => p.status === "expired");
  const due30 = pkgs.filter((p) => p.status === "active" && daysLeft(p.expiresAt, now) <= 30);
  const arr = pkgs.filter((p) => p.status === "active").reduce((s, p) => s + Math.round((price(p) / p.plan.periodMonths) * 12), 0);
  const income = await db.payment.aggregate({
    where: { status: "recorded", paidAt: { gte: athensDay(year, 1, 1), lt: athensDay(year + 1, 1, 1) } },
    _sum: { netCents: true, vatCents: true, amountCents: true },
  });
  return {
    overdue: { count: overdue.length, netCents: overdue.reduce((s, p) => s + price(p), 0) },
    due30: { count: due30.length, netCents: due30.reduce((s, p) => s + price(p), 0) },
    incomeYear: { year, net: income._sum.netCents ?? 0, vat: income._sum.vatCents ?? 0, gross: income._sum.amountCents ?? 0 },
    arrNetCents: arr,
  };
}

/** Reports tab: everything for one year. */
export async function getReports(year: number) {
  const now = new Date();
  const [clients, websites, pkgs, payments, allTime] = await Promise.all([
    db.client.findMany({ include: { packages: { select: { status: true } } } }),
    db.website.findMany({ include: { packages: { include: { package: { select: { status: true } } } } } }),
    db.hostingPackage.findMany({ include: { plan: true } }),
    db.payment.findMany({
      where: { status: "recorded", paidAt: { gte: athensDay(year - 1, 1, 1), lt: athensDay(year + 1, 1, 1) } },
      include: { package: { include: { plan: true, client: true } } },
    }),
    db.payment.aggregate({ where: { status: "recorded" }, _sum: { netCents: true, vatCents: true, amountCents: true } }),
  ]);
  const price = (p: (typeof pkgs)[number]) => p.customPriceNetCents ?? p.plan.priceNetCents;
  const inYear = (y: number) => payments.filter((p) => athensYear(p.paidAt) === y);
  const sum = (ps: typeof payments) => ({
    net: ps.reduce((s, p) => s + p.netCents, 0),
    vat: ps.reduce((s, p) => s + p.vatCents, 0),
    gross: ps.reduce((s, p) => s + p.amountCents, 0),
  });
  const thisYear = inYear(year);
  const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
  const currentMonth = monthKey(now);

  const activeClients = clients.filter((c) => c.packages.some((p) => p.status === "active")).length;
  const activeSites = websites.filter((w) => w.packages.some((p) => p.package.status === "active")).length;
  const active = pkgs.filter((p) => p.status === "active");
  const within = (days: number) => active.filter((p) => { const d = daysLeft(p.expiresAt, now); return d >= 0 && d <= days; });

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const byMonth = months.map((m) => {
    const ps = thisYear.filter((p) => monthKey(p.paidAt) === m);
    return { month: m, ...sum(ps) };
  });

  const byPlan = Object.values(
    thisYear.reduce<Record<string, { plan: string; net: number }>>((acc, p) => {
      const k = p.package.plan.name;
      (acc[k] ??= { plan: k, net: 0 }).net += p.netCents;
      return acc;
    }, {}),
  ).sort((a, b) => b.net - a.net);

  const topClients = Object.values(
    thisYear.reduce<Record<string, { client: string; id: string; net: number; gross: number; count: number }>>((acc, p) => {
      const c = p.package.client;
      const row = (acc[c.id] ??= { client: c.name, id: c.id, net: 0, gross: 0, count: 0 });
      row.net += p.netCents;
      row.gross += p.amountCents;
      row.count++;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.net - a.net)
    .slice(0, 10);

  // Renewals calendar: next 12 months, amount due per month.
  const calendar = Array.from({ length: 12 }, (_, i) => {
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
    const due = active.filter((p) => monthKey(p.expiresAt) === key);
    return { month: key, net: due.reduce((s, p) => s + price(p), 0), count: due.length };
  });

  const ty = sum(thisYear);
  return {
    year,
    clients: { active: activeClients, linked: clients.filter((c) => c.elorusContactId).length, total: clients.length },
    websites: { total: websites.length, active: activeSites },
    packages: {
      active: active.length,
      expiring30: within(30).length,
      overdue: pkgs.filter((p) => p.status === "expired").length,
    },
    income: {
      thisMonth: sum(thisYear.filter((p) => monthKey(p.paidAt) === currentMonth)),
      thisYear: ty,
      lastYear: sum(inYear(year - 1)),
      allTime: { net: allTime._sum.netCents ?? 0, vat: allTime._sum.vatCents ?? 0, gross: allTime._sum.amountCents ?? 0 },
    },
    arrNetCents: active.reduce((s, p) => s + Math.round((price(p) / p.plan.periodMonths) * 12), 0),
    expected: { d30: within(30).reduce((s, p) => s + price(p), 0), d90: within(90).reduce((s, p) => s + price(p), 0) },
    overdue: {
      count: pkgs.filter((p) => p.status === "expired").length,
      net: pkgs.filter((p) => p.status === "expired").reduce((s, p) => s + price(p), 0),
    },
    averages: { perClient: activeClients ? Math.round(ty.net / activeClients) : 0, perSite: activeSites ? Math.round(ty.net / activeSites) : 0 },
    byMonth,
    byPlan,
    topClients,
    calendar,
  };
}
