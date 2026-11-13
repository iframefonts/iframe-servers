import { env } from "@/lib/env";
import { inngest } from "@/inngest/client";

/**
 * Background work. With Inngest configured, events go to Inngest (retries with backoff).
 * Without it (local dev), the work runs inline so the app still works end to end.
 */
export async function enqueueInvoice(paymentId: string) {
  if (env.inngestEnabled) {
    await inngest.send({ name: "invoice/issue", data: { paymentId } });
    return;
  }
  const { issueInvoice } = await import("@/lib/invoices/issue");
  await issueInvoice(paymentId).catch((err) => console.error("[jobs] issue-invoice failed", err));
}

export async function notifyNeedsRefund(paymentId: string, reason: string) {
  const [{ createElement }, { AdminEmail }, { getMailer }, { db }, { formatEur }] = await Promise.all([
    import("react"),
    import("@/emails/admin-email"),
    import("@/lib/email/send"),
    import("@/lib/db"),
    import("@/lib/money"),
  ]);
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { package: { include: { client: true } } } });
  await getMailer()
    .send({
      to: [env.adminEmail],
      subject: `Needs refund: ${p.package.client.name} paid twice`,
      idempotencyKey: `refund:${paymentId}`,
      react: createElement(AdminEmail, {
        title: "A payment needs a refund",
        intro: "This charge did not renew anything. Refund it in the provider's dashboard.",
        rows: [
          { label: "Client", value: p.package.client.name },
          { label: "Amount", value: formatEur(p.amountCents, "en") },
          { label: "Provider", value: p.provider },
          { label: "Transaction", value: p.transactionId },
          { label: "Reason", value: reason },
        ],
        actionUrl: `${env.appUrl}/renewals/${p.packageId}`,
        actionLabel: "Open package",
      }),
    })
    .catch(() => undefined);
}

/** After any payment source records a payment. */
export async function afterPayment(result: import("@/lib/payments/record").RecordOutcome) {
  if (result.outcome === "recorded") await enqueueInvoice(result.paymentId);
  if (result.outcome === "needs_refund") await notifyNeedsRefund(result.paymentId, result.reason);
}
