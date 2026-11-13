import type { PaymentProvider } from "@/generated/prisma/enums";
import { db as defaultDb, isUniqueViolation, type Db } from "@/lib/db";
import { addPeriod } from "@/lib/dates";

export type RecordPaymentInput = {
  provider: PaymentProvider;
  transactionId: string;
  paymentRequestId: string;
  amountCents: number;
  paidAt: Date;
  raw?: unknown;
  /** Provider event id, stored for idempotency. */
  webhookEventId?: string;
};

export type RecordOutcome =
  | { outcome: "recorded"; paymentId: string; newExpiresAt: Date }
  | { outcome: "duplicate" }
  | { outcome: "needs_refund"; paymentId: string; reason: string };

/**
 * The one place payments enter the system (Viva, bank transfer, mock checkout).
 * A PaymentRequest moves open → paid exactly once. Only that transition extends the package.
 * Anything else that was charged (second tab, second provider, wrong amount) is kept as needs_refund.
 */
export async function recordPayment(input: RecordPaymentInput, db: Db = defaultDb): Promise<RecordOutcome> {
  try {
    return await db.$transaction(async (tx) => {
      if (input.webhookEventId) {
        await tx.webhookEvent.create({
          data: { provider: input.provider, eventId: input.webhookEventId, processedAt: new Date() },
        });
      }
      const pr = await tx.paymentRequest.findUniqueOrThrow({
        where: { id: input.paymentRequestId },
        include: { package: { include: { plan: true } } },
      });
      const base = {
        paymentRequestId: pr.id,
        packageId: pr.packageId,
        provider: input.provider,
        transactionId: input.transactionId,
        netCents: pr.netCents,
        vatCents: pr.vatCents,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        rawPayload: (input.raw ?? undefined) as object | undefined,
      };

      if (input.amountCents !== pr.amountCents) {
        const p = await tx.payment.create({ data: { ...base, status: "needs_refund" } });
        return { outcome: "needs_refund" as const, paymentId: p.id, reason: `Amount ${input.amountCents} ≠ expected ${pr.amountCents}` };
      }

      // The guard: only one caller can flip open → paid. Concurrent callers block on the row
      // lock and then see status='paid', so their update matches 0 rows.
      const flipped = await tx.paymentRequest.updateMany({
        where: { id: pr.id, status: "open" },
        data: { status: "paid", paidAt: input.paidAt },
      });
      if (flipped.count === 0) {
        const p = await tx.payment.create({ data: { ...base, status: "needs_refund" } });
        return { outcome: "needs_refund" as const, paymentId: p.id, reason: "Renewal was already paid" };
      }

      const payment = await tx.payment.create({ data: { ...base, status: "recorded" } });
      // Extend from the old expiry date (the period that was paid), not from today.
      const newExpiresAt = addPeriod(pr.periodEnd, pr.package.plan.periodMonths);
      await tx.hostingPackage.update({
        where: { id: pr.packageId },
        data: { expiresAt: newExpiresAt, status: "active" },
      });
      await tx.invoice.create({ data: { paymentId: payment.id } });
      return { outcome: "recorded" as const, paymentId: payment.id, newExpiresAt };
    });
  } catch (err) {
    // Same webhook event or same transaction id delivered again.
    if (isUniqueViolation(err)) return { outcome: "duplicate" };
    throw err;
  }
}
