import { db as defaultDb } from "@/lib/db";

type Db = typeof defaultDb;

/**
 * What deleting a client would remove. Deleting cascades to websites, packages, reminders,
 * payment requests, payments and invoice records, so it is blocked once any invoice has been
 * issued in Elorus: that record belongs to myDATA and has to stay.
 */
export async function clientDeletion(clientId: string, db: Db = defaultDb) {
  const [websites, packages, payments, issuedInvoices] = await Promise.all([
    db.website.count({ where: { clientId } }),
    db.hostingPackage.count({ where: { clientId } }),
    db.payment.count({ where: { package: { clientId } } }),
    db.invoice.count({ where: { payment: { package: { clientId } }, elorusInvoiceId: { not: null } } }),
  ]);
  return { websites, packages, payments, issuedInvoices, allowed: issuedInvoices === 0 };
}
