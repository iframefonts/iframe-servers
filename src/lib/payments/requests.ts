import { randomBytes } from "node:crypto";
import { db as defaultDb, isUniqueViolation, type Db } from "@/lib/db";
import { addPeriod } from "@/lib/dates";
import { amountsFor } from "@/lib/money";

/** Pay links stay valid this long after the period end (late payers can still pay). */
const LINK_GRACE_MONTHS = 3;

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function packagePriceNet(db: Db, packageId: string) {
  const pkg = await db.hostingPackage.findUniqueOrThrow({
    where: { id: packageId },
    include: { plan: true, client: true },
  });
  return { pkg, netCents: pkg.customPriceNetCents ?? pkg.plan.priceNetCents };
}

/**
 * One PaymentRequest per (package, period). Reused across reminders; while still open, its
 * amount is re-snapshotted if the price or the client's VAT regime changed.
 */
export async function getOrCreatePaymentRequest(packageId: string, opts: { db?: Db; now?: Date } = {}) {
  const db = opts.db ?? defaultDb;
  const { pkg, netCents } = await packagePriceNet(db, packageId);
  const periodEnd = pkg.expiresAt;
  const amounts = amountsFor(netCents, pkg.client.vatRegime);

  const existing = await db.paymentRequest.findUnique({
    where: { packageId_periodEnd: { packageId, periodEnd } },
  });
  if (existing) {
    if (existing.status === "open" && existing.amountCents !== amounts.amountCents) {
      return db.paymentRequest.update({
        where: { id: existing.id },
        data: { ...amounts, vivaOrderCode: null },
      });
    }
    return existing;
  }
  try {
    return await db.paymentRequest.create({
      data: {
        packageId,
        periodEnd,
        token: newToken(),
        ...amounts,
        expiresAt: addPeriod(periodEnd, LINK_GRACE_MONTHS),
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return db.paymentRequest.findUniqueOrThrow({ where: { packageId_periodEnd: { packageId, periodEnd } } });
  }
}

export type PayPageState = "open" | "paid" | "expired" | "cancelled";

export function payPageState(
  pr: { status: string; expiresAt: Date },
  pkgStatus: string,
  now = new Date(),
): PayPageState {
  if (pr.status === "paid") return "paid";
  if (pr.status === "cancelled" || pkgStatus === "cancelled") return "cancelled";
  if (pr.status === "expired" || pr.expiresAt < now) return "expired";
  return "open";
}
