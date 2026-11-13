import { createElement } from "react";
import { AdminEmail } from "@/emails/admin-email";
import { db as defaultDb, type Db } from "@/lib/db";
import { addPeriod, formatShortDate, toDateInput } from "@/lib/dates";
import { getElorus, missingInvoiceDetails, type ElorusApi } from "@/lib/elorus/client";
import { syncClientFromElorus } from "@/lib/elorus/sync";
import { getMailer, type Mailer } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatEur } from "@/lib/money";
import { parseLines } from "@/lib/renewal";

export const MAX_INVOICE_ATTEMPTS = 5;

const periodText = (start: Date, months: number) => `${formatShortDate(start, "en")} – ${formatShortDate(addPeriod(start, months), "en")}`;

/** Invoice lines from the renewal snapshot: hosting for the period, plus each domain renewed with it. */
export function invoiceLines(
  payment: { netCents: number; paymentRequest: { lines: unknown } | null },
  pkg: { plan: { name: string; kind: string; periodMonths: number; elorusProductId: string | null } },
  domains: string,
  periodStart: Date,
) {
  const lines = parseLines(payment.paymentRequest?.lines);
  if (!lines) {
    return [{ title: `Web hosting ${pkg.plan.name}${domains ? ` (${domains})` : ""}, ${periodText(periodStart, pkg.plan.periodMonths)}`, netCents: payment.netCents, productId: pkg.plan.elorusProductId }];
  }
  return lines.map((l) =>
    l.kind === "domain"
      ? { title: `Domain name ${l.label}, ${periodText(periodStart, l.periodMonths)}`, netCents: l.netCents, productId: process.env.ELORUS_PRODUCT_DOMAIN || null }
      : {
          title: `${pkg.plan.kind === "domain" ? "Domain name" : "Web hosting"} ${l.label}${domains ? ` (${domains})` : ""}, ${periodText(periodStart, l.periodMonths)}`,
          netCents: l.netCents,
          productId: pkg.plan.elorusProductId,
        },
  );
}

/** Elorus document series per invoice type and VAT regime. Set the real ids once created in Elorus. */
export function documentTypeFor(invoiceType: "TPY" | "APY", regime: "domestic" | "eu_reverse_charge" | "non_eu") {
  if (regime === "eu_reverse_charge") return process.env.ELORUS_DOCTYPE_EU ?? "TPY-EU";
  if (regime === "non_eu") return process.env.ELORUS_DOCTYPE_NON_EU ?? "TPY-3C";
  return invoiceType === "TPY" ? (process.env.ELORUS_DOCTYPE_TPY ?? "TPY") : (process.env.ELORUS_DOCTYPE_APY ?? "APY");
}

/** Details missing in Elorus: retrying won't help, the admin has to fix the contact. */
export class MissingDetailsError extends Error {}

type Deps = { db?: Db; elorus?: ElorusApi; mailer?: Mailer };

/**
 * Idempotent: each step records its result, so a retry resumes where the last attempt stopped
 * and never creates a second Elorus invoice.
 */
export async function issueInvoice(paymentId: string, deps: Deps = {}) {
  const db = deps.db ?? defaultDb;
  const elorus = deps.elorus ?? getElorus();
  const mailer = deps.mailer ?? getMailer();

  let invoice = await db.invoice.update({
    where: { paymentId },
    data: { attempts: { increment: 1 } },
    include: {
      payment: {
        include: {
          package: { include: { client: true, plan: true, websites: { include: { website: true } } } },
          paymentRequest: true,
        },
      },
    },
  });
  if (invoice.status === "issued" && invoice.emailStatus !== "pending") return invoice;

  const { payment } = invoice;
  const pkg = payment.package;
  try {
    // Fresh tax details right before invoicing.
    const client = pkg.client.elorusContactId ? await syncClientFromElorus(pkg.client.id, { db, elorus }) : pkg.client;
    const missing = missingInvoiceDetails(client);
    if (missing.length) throw new MissingDetailsError(`Missing in Elorus: ${missing.join(", ")}`);

    const domains = pkg.websites.map((w) => w.website.domain).join(", ");
    const periodStart = payment.paymentRequest?.periodEnd ?? pkg.expiresAt;
    const date = toDateInput(payment.paidAt);

    if (!invoice.elorusInvoiceId) {
      const created = await elorus.createInvoice({
        contactId: client.elorusContactId!,
        documentType: documentTypeFor(client.invoiceType, client.vatRegime),
        date,
        lines: invoiceLines(payment, pkg, domains, periodStart),
        vatRate: payment.paymentRequest?.vatRate ?? 24,
      });
      await elorus.recordPayment({ invoiceId: created.id, contactId: client.elorusContactId!, amountCents: payment.amountCents, date });
      invoice = await db.invoice.update({
        where: { id: invoice.id },
        data: { elorusInvoiceId: created.id, number: created.number, status: "issued", lastError: null },
        include: { payment: { include: { package: { include: { client: true, plan: true, websites: { include: { website: true } } } }, paymentRequest: true } } },
      });
    }

    await elorus.emailInvoice({ invoiceId: invoice.elorusInvoiceId!, to: client.emails });
    invoice = await db.invoice.update({
      where: { id: invoice.id },
      data: { emailStatus: "sent", emailedAt: new Date(), lastError: null },
      include: { payment: { include: { package: { include: { client: true, plan: true, websites: { include: { website: true } } } }, paymentRequest: true } } },
    });

    await mailer
      .send({
        to: [env.adminEmail],
        subject: `Paid: ${domains || pkg.plan.name} · ${invoice.number}`,
        idempotencyKey: `paid:${payment.id}`,
        react: createElement(AdminEmail, {
          title: `Renewal paid: ${domains || pkg.plan.name}`,
          rows: [
            { label: "Client", value: client.name },
            { label: "Amount", value: formatEur(payment.amountCents, "en") },
            { label: "Paid via", value: payment.provider.replace("_", " ") },
            { label: "Invoice", value: invoice.number ?? "" },
            { label: "New expiry", value: formatShortDate(pkg.expiresAt, "en") },
          ],
          actionUrl: `${env.appUrl}/renewals/${pkg.id}`,
          actionLabel: "Open package",
        }),
      })
      .catch(() => undefined);
    return invoice;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final = err instanceof MissingDetailsError || invoice.attempts >= MAX_INVOICE_ATTEMPTS;
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        lastError: message,
        status: invoice.elorusInvoiceId ? "issued" : final ? "failed" : "pending",
        emailStatus: invoice.elorusInvoiceId && final ? "failed" : undefined,
      },
    });
    if (final) {
      await mailer
        .send({
          to: [env.adminEmail],
          subject: `Invoice needs you: ${pkg.client.name}`,
          idempotencyKey: `invoice-failed:${invoice.id}:${invoice.attempts}`,
          react: createElement(AdminEmail, {
            title: "An invoice could not be issued",
            intro: "The payment is recorded and the package is renewed. The Elorus invoice still needs attention.",
            rows: [
              { label: "Client", value: pkg.client.name },
              { label: "Amount", value: formatEur(payment.amountCents, "en") },
              { label: "Error", value: message },
            ],
            actionUrl: `${env.appUrl}/renewals/${pkg.id}`,
            actionLabel: "Open package",
          }),
        })
        .catch(() => undefined);
      if (err instanceof MissingDetailsError) return invoice; // don't retry
    }
    throw err;
  }
}
