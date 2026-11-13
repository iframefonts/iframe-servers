import { createElement } from "react";
import { AdminEmail } from "@/emails/admin-email";
import { db as defaultDb, type Db } from "@/lib/db";
import { addPeriod, formatShortDate, toDateInput } from "@/lib/dates";
import { getElorus, missingInvoiceDetails, type ElorusApi, type ElorusDocumentSpec } from "@/lib/elorus/client";
import { syncClientFromElorus } from "@/lib/elorus/sync";
import { getMailer, type Mailer } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatEur } from "@/lib/money";
import { parseLines } from "@/lib/renewal";

export const MAX_INVOICE_ATTEMPTS = 5;

const periodText = (start: Date, months: number, locale: "el" | "en") =>
  `${formatShortDate(start, locale)} – ${formatShortDate(addPeriod(start, months), locale)}`;

const LINE = {
  el: { hosting: (plan: string) => `Φιλοξενία ιστοσελίδας ${plan}`, domain: (d: string) => `Όνομα χώρου (domain) ${d}` },
  en: { hosting: (plan: string) => `Web hosting ${plan}`, domain: (d: string) => `Domain name ${d}` },
};

/** Invoice lines from the renewal snapshot, in the client's language: hosting, plus each domain renewed with it. */
export function invoiceLines(
  payment: { netCents: number; paymentRequest: { lines: unknown } | null },
  pkg: { plan: { name: string; kind: string; periodMonths: number; elorusProductId: string | null } },
  domains: string,
  periodStart: Date,
  locale: "el" | "en" = "el",
) {
  const t = LINE[locale];
  const withSites = (title: string) => (domains ? `${title} (${domains})` : title);
  const lines = parseLines(payment.paymentRequest?.lines);
  if (!lines) {
    return [{ title: withSites(t.hosting(pkg.plan.name)), description: periodText(periodStart, pkg.plan.periodMonths, locale), netCents: payment.netCents, productId: pkg.plan.elorusProductId }];
  }
  return lines.map((l) =>
    l.kind === "domain"
      ? { title: t.domain(l.label), description: periodText(periodStart, l.periodMonths, locale), netCents: l.netCents, productId: process.env.ELORUS_PRODUCT_DOMAIN || null }
      : { title: withSites(t.hosting(l.label)), description: periodText(periodStart, l.periodMonths, locale), netCents: l.netCents, productId: pkg.plan.elorusProductId },
  );
}

/**
 * How each invoice is issued in Elorus/myDATA, per invoice type and VAT regime (confirmed on the demo org):
 * - ΤΠΥ, domestic: myDATA 2.1, E3_561_001, 24% VAT
 * - ΑΠΥ, individuals: myDATA 11.2, E3_561_003, 24% VAT
 * - EU business (reverse charge): myDATA 2.2, E3_561_005, 0% VAT + exemption category
 * - Non-EU: myDATA 2.3, E3_561_006, 0% VAT + exemption category
 * Ids come from the Elorus organization (env). The exemption categories need the accountant's confirmation.
 */
export function elorusDocumentFor(invoiceType: "TPY" | "APY", regime: "domestic" | "eu_reverse_charge" | "non_eu"): ElorusDocumentSpec {
  const e = process.env;
  const tpy = e.ELORUS_DOCTYPE_TPY ?? "TPY";
  if (regime === "eu_reverse_charge") {
    return { series: "TPY-EU", documentTypeId: e.ELORUS_DOCTYPE_EU || tpy, mydataDocumentType: "2.2", classificationType: "E3_561_005", taxId: e.ELORUS_TAX_VAT0 ?? "VAT0", vatExemptionCategory: e.ELORUS_VAT_EXEMPTION_EU || undefined };
  }
  if (regime === "non_eu") {
    return { series: "TPY-3C", documentTypeId: e.ELORUS_DOCTYPE_NON_EU || tpy, mydataDocumentType: "2.3", classificationType: "E3_561_006", taxId: e.ELORUS_TAX_VAT0 ?? "VAT0", vatExemptionCategory: e.ELORUS_VAT_EXEMPTION_NON_EU || undefined };
  }
  if (invoiceType === "APY") {
    return { series: "APY", documentTypeId: e.ELORUS_DOCTYPE_APY ?? "APY", mydataDocumentType: "11.2", classificationType: "E3_561_003", taxId: e.ELORUS_TAX_VAT24 ?? "VAT24" };
  }
  return { series: "TPY", documentTypeId: tpy, mydataDocumentType: "2.1", classificationType: "E3_561_001", taxId: e.ELORUS_TAX_VAT24 ?? "VAT24" };
}

export const INVOICE_EMAIL = {
  el: {
    subject: (n: string, d: string) => `Τιμολόγιο ${n} · Ανανέωση φιλοξενίας ${d}`,
    message: (d: string) => `Σας ευχαριστούμε για την ανανέωση της φιλοξενίας του ${d}. Επισυνάπτεται το παραστατικό σε PDF.\n\niFRAME Design Studio`,
  },
  en: {
    subject: (n: string, d: string) => `Invoice ${n} · Hosting renewal ${d}`,
    message: (d: string) => `Thank you for renewing the hosting for ${d}. Your invoice is attached as a PDF.\n\niFRAME Design Studio`,
  },
};

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
        doc: elorusDocumentFor(client.invoiceType, client.vatRegime),
        date,
        lines: invoiceLines(payment, pkg, domains, periodStart, client.language),
      });
      await elorus.recordPayment({
        invoiceId: created.id,
        contactId: client.elorusContactId!,
        amountCents: payment.amountCents,
        date,
        title: payment.provider === "bank_transfer" ? "Bank transfer" : "Viva card payment",
      });
      invoice = await db.invoice.update({
        where: { id: invoice.id },
        data: { elorusInvoiceId: created.id, number: created.number, status: "issued", lastError: null },
        include: { payment: { include: { package: { include: { client: true, plan: true, websites: { include: { website: true } } } }, paymentRequest: true } } },
      });
    }

    const mail = INVOICE_EMAIL[client.language];
    await elorus.emailInvoice({
      invoiceId: invoice.elorusInvoiceId!,
      to: client.emails,
      subject: mail.subject(invoice.number ?? "", domains || pkg.plan.name),
      message: mail.message(domains || pkg.plan.name),
    });
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
