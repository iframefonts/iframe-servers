import { createElement } from "react";
import { AdminEmail } from "@/emails/admin-email";
import { ReminderEmail, type EmailKind } from "@/emails/reminder-email";
import { db as defaultDb, isUniqueViolation, type Db } from "@/lib/db";
import { daysLeft, formatDate, formatShortDate } from "@/lib/dates";
import { getMailer, type Mailer } from "@/lib/email/send";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { formatEur } from "@/lib/money";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { parseLines } from "@/lib/renewal";

export const MAX_REMINDER_ATTEMPTS = 5;
/** A pending row older than this is treated as a crashed send and retried. */
const STALE_PENDING_MS = 15 * 60 * 1000;
/** Overdue team alert is sent once, 3 days after expiry; older expiries are not alerted (avoids alert storms after an import). */
const OVERDUE_ALERT_FROM = -3;
const OVERDUE_ALERT_UNTIL = -30;

type Deps = { db?: Db; mailer?: Mailer; now?: Date };

/** Windows, not exact days: a missed daily run never skips a reminder. */
export function reminderKindFor(days: number): "d30" | "d7" | "d1" | null {
  if (days <= 30 && days >= 8) return "d30";
  if (days <= 7 && days >= 2) return "d7";
  if (days <= 1 && days >= 0) return "d1";
  return null;
}

export type RunSummary = {
  expired: number;
  sent: number;
  failed: number;
  skippedPaid: number;
  overdueAlerts: number;
  digestSent: boolean;
};

export async function runReminders(deps: Deps = {}): Promise<RunSummary> {
  const db = deps.db ?? defaultDb;
  const mailer = deps.mailer ?? getMailer();
  const now = deps.now ?? new Date();
  const summary: RunSummary = { expired: 0, sent: 0, failed: 0, skippedPaid: 0, overdueAlerts: 0, digestSent: false };

  // 1. Mark packages whose expiry day has passed as expired. Sites are never suspended.
  const active = await db.hostingPackage.findMany({ where: { status: "active" } });
  for (const pkg of active) {
    if (daysLeft(pkg.expiresAt, now) < 0) {
      await db.hostingPackage.update({ where: { id: pkg.id }, data: { status: "expired" } });
      summary.expired++;
    }
  }

  // 2. Client reminders for active packages expiring within 30 days.
  const horizon = new Date(now.getTime() + 32 * 86400_000);
  const due = await db.hostingPackage.findMany({
    where: { status: "active", remindersEnabled: true, expiresAt: { lte: horizon } },
  });
  for (const pkg of due) {
    const kind = reminderKindFor(daysLeft(pkg.expiresAt, now));
    if (!kind) continue;

    const paid = await db.paymentRequest.findFirst({
      where: { packageId: pkg.id, periodEnd: pkg.expiresAt, status: "paid" },
    });
    if (paid) {
      summary.skippedPaid++;
      continue;
    }

    let reminderId: string;
    try {
      const r = await db.reminder.create({ data: { packageId: pkg.id, kind, periodEnd: pkg.expiresAt } });
      reminderId = r.id;
    } catch (err) {
      if (isUniqueViolation(err)) continue; // already sent (or being retried) for this period
      throw err;
    }
    const ok = await sendReminder(reminderId, { db, mailer, now });
    if (ok) summary.sent++;
    else summary.failed++;
  }

  // 3. Overdue team alert, once per period, 3 days after expiry.
  const overdue = await db.hostingPackage.findMany({ where: { status: "expired" }, include: { client: true, websites: { include: { website: true } } } });
  for (const pkg of overdue) {
    const d = daysLeft(pkg.expiresAt, now);
    if (d > OVERDUE_ALERT_FROM || d < OVERDUE_ALERT_UNTIL) continue;
    let reminderId: string;
    try {
      reminderId = (await db.reminder.create({ data: { packageId: pkg.id, kind: "overdue3d", periodEnd: pkg.expiresAt } })).id;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
    if (await sendReminder(reminderId, { db, mailer, now })) summary.overdueAlerts++;
  }

  // 4. Daily digest to the team.
  summary.digestSent = await sendDigest({ db, mailer, now });
  return summary;
}

/** Sends one reminder row. Marks it sent or failed; never deletes it. Returns true on success. */
export async function sendReminder(reminderId: string, deps: Deps = {}): Promise<boolean> {
  const db = deps.db ?? defaultDb;
  const mailer = deps.mailer ?? getMailer();
  const now = deps.now ?? new Date();

  const reminder = await db.reminder.update({
    where: { id: reminderId },
    data: { attempts: { increment: 1 } },
    include: {
      package: { include: { client: true, plan: true, websites: { include: { website: true } } } },
    },
  });
  const pkg = reminder.package;
  const domains = pkg.websites.map((w) => w.website.domain).join(", ") || pkg.plan.name;

  try {
    let emailId: string;
    if (reminder.kind === "overdue3d") {
      const pr = await getOrCreatePaymentRequest(pkg.id, { db, now });
      const res = await mailer.send({
        to: [env.adminEmail],
        subject: `Overdue: ${domains} (${pkg.client.name})`,
        idempotencyKey: `reminder:${reminder.id}`,
        react: createElement(AdminEmail, {
          title: `Hosting overdue: ${domains}`,
          intro: "Still unpaid 3 days after expiry. The client was not emailed and the site stays online.",
          rows: [
            { label: "Client", value: pkg.client.name },
            { label: "Amount", value: formatEur(pr.amountCents, "en") },
            { label: "Expired", value: formatShortDate(pkg.expiresAt, "en") },
            { label: "Days overdue", value: String(-daysLeft(pkg.expiresAt, now)) },
          ],
          actionUrl: `${env.appUrl}/renewals/${pkg.id}`,
          actionLabel: "Open package",
        }),
      });
      emailId = res.id;
    } else {
      const to = pkg.client.emails.filter(Boolean);
      if (to.length === 0) throw new Error("Client has no email address");
      const pr = await getOrCreatePaymentRequest(pkg.id, { db, now });
      const locale = pkg.client.language;
      const d = daysLeft(pkg.expiresAt, now);
      const kind: EmailKind =
        reminder.kind === "manual" ? (reminderKindFor(d) ?? (d > 30 ? "d30" : "overdue")) : (reminder.kind as EmailKind);
      const amount = formatEur(pr.amountCents, locale);
      const expiryDate = formatDate(pkg.expiresAt, locale);
      const res = await mailer.send({
        to,
        cc: reminder.kind === "d1" ? [env.adminEmail] : undefined,
        subject: t[locale].reminderSubject[kind](domains, expiryDate),
        idempotencyKey: `reminder:${reminder.id}`,
        react: createElement(ReminderEmail, {
          locale,
          kind,
          domain: domains,
          expiryDate,
          amount,
          payUrl: `${env.appUrl}/pay/${pr.token}`,
          extras: (parseLines(pr.lines) ?? []).filter((l) => l.kind === "domain").map((l) => t[locale].includesDomain(l.label, l.periodMonths)),
        }),
      });
      emailId = res.id;
    }
    await db.reminder.update({
      where: { id: reminder.id },
      data: { status: "sent", emailId, sentAt: now, lastError: null },
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.reminder.update({ where: { id: reminder.id }, data: { status: "failed", lastError: message } });
    if (reminder.attempts >= MAX_REMINDER_ATTEMPTS) {
      await mailer
        .send({
          to: [env.adminEmail],
          subject: `Reminder failed ${MAX_REMINDER_ATTEMPTS} times: ${domains}`,
          idempotencyKey: `reminder-failed:${reminder.id}`,
          react: createElement(AdminEmail, {
            title: "A reminder could not be sent",
            rows: [
              { label: "Client", value: pkg.client.name },
              { label: "Websites", value: domains },
              { label: "Error", value: message },
            ],
            actionUrl: `${env.appUrl}/renewals/${pkg.id}`,
            actionLabel: "Open package",
          }),
        })
        .catch(() => undefined);
    }
    return false;
  }
}

/** Retries failed reminders and pending ones left behind by a crash. Run every few minutes (Inngest). */
export async function retryReminders(deps: Deps = {}): Promise<number> {
  const db = deps.db ?? defaultDb;
  const now = deps.now ?? new Date();
  const rows = await db.reminder.findMany({
    where: {
      attempts: { lt: MAX_REMINDER_ATTEMPTS },
      OR: [{ status: "failed" }, { status: "pending", updatedAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } }],
    },
    select: { id: true },
  });
  let ok = 0;
  for (const r of rows) if (await sendReminder(r.id, { ...deps, db, now })) ok++;
  return ok;
}

async function sendDigest({ db, mailer, now }: Required<Deps>): Promise<boolean> {
  const pkgs = await db.hostingPackage.findMany({
    where: { status: { in: ["active", "expired"] } },
    include: { client: true, websites: { include: { website: true } } },
    orderBy: { expiresAt: "asc" },
  });
  const label = (p: (typeof pkgs)[number]) =>
    `${p.websites.map((w) => w.website.domain).join(", ") || "(no website)"} · ${p.client.name} · ${formatShortDate(p.expiresAt, "en")}`;
  const expiring = pkgs.filter((p) => p.status === "active" && daysLeft(p.expiresAt, now) <= 30).map(label);
  const overdue = pkgs.filter((p) => p.status === "expired").map(label);
  const day = formatShortDate(now, "en");
  try {
    await mailer.send({
      to: [env.adminEmail],
      subject: `Hosting digest ${day}: ${expiring.length} expiring, ${overdue.length} overdue`,
      idempotencyKey: `digest:${now.toISOString().slice(0, 10)}`,
      react: createElement(AdminEmail, {
        title: `Hosting digest, ${day}`,
        sections: [
          { heading: `Expiring in 30 days (${expiring.length})`, items: expiring, empty: "Nothing expires in the next 30 days." },
          { heading: `Expired and unpaid (${overdue.length})`, items: overdue, empty: "Nothing is overdue." },
        ],
        actionUrl: env.appUrl,
        actionLabel: "Open Today",
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/** "Send Reminder" from the package page. Always sends (manual rows don't block automatic ones). */
export async function sendManualReminder(packageId: string, actor: string, deps: Deps = {}) {
  const db = deps.db ?? defaultDb;
  const pkg = await db.hostingPackage.findUniqueOrThrow({ where: { id: packageId } });
  const seq = (await db.reminder.count({ where: { packageId, kind: "manual", periodEnd: pkg.expiresAt } })) + 1;
  const r = await db.reminder.create({ data: { packageId, kind: "manual", periodEnd: pkg.expiresAt, seq, sentBy: actor } });
  const ok = await sendReminder(r.id, deps);
  return { ok, reminder: await db.reminder.findUniqueOrThrow({ where: { id: r.id } }) };
}
