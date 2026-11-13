import "server-only";
import { db } from "@/lib/db";
import { afterPayment } from "@/lib/jobs";
import { vivaTransaction } from "@/lib/payments/providers";
import { recordPayment, type RecordOutcome } from "@/lib/payments/record";

/**
 * Trust nothing from the caller: re-fetch the transaction from Viva and check that orderCode,
 * status and amount match our PaymentRequest before recording (Viva's recommendation).
 * Used by both the webhook and the browser return URL; recordPayment makes the second a no-op.
 */
export async function confirmVivaTransaction(transactionId: string, opts: { webhookEventId?: string } = {}): Promise<
  { ok: true; token: string; outcome: RecordOutcome["outcome"] } | { ok: false; reason: string; token?: string }
> {
  const tx = await vivaTransaction(transactionId);
  const pr = await db.paymentRequest.findFirst({
    where: { OR: [{ vivaOrderCode: String(tx.orderCode) }, ...(tx.merchantTrns ? [{ id: tx.merchantTrns }] : [])] },
  });
  if (!pr) return { ok: false, reason: `No payment request for order ${tx.orderCode}` };
  if (tx.statusId !== "F") return { ok: false, reason: `Transaction status ${tx.statusId}`, token: pr.token };

  const result = await recordPayment({
    provider: "viva",
    transactionId,
    paymentRequestId: pr.id,
    amountCents: Math.round(tx.amount * 100),
    paidAt: tx.insDate ? new Date(tx.insDate) : new Date(),
    raw: tx,
    webhookEventId: opts.webhookEventId,
  });
  await afterPayment(result);
  return { ok: true, token: pr.token, outcome: result.outcome };
}
