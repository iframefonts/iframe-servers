import { beforeEach, describe, expect, it } from "vitest";
import { getCalendar } from "@/lib/calendar";
import { athensDay } from "@/lib/dates";
import { recordPayment } from "@/lib/payments/record";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { at, db, makePackage, reset } from "./helpers";

describe("calendar", () => {
  beforeEach(reset);

  it("puts a renewal in its expiry month, and keeps a paid one there after the expiry moves on", async () => {
    const { pkg } = await makePackage({ expiresAt: athensDay(2026, 12, 31) });
    let months = await getCalendar("2026-11", 14, { db, now: at(2026, 11, 13) });
    expect(months.find((m) => m.key === "2026-12")!.entries.map((e) => [e.day, e.status.label])).toEqual([[31, "Active"]]);

    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    await recordPayment({ provider: "viva", transactionId: "v1", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: at(2026, 12, 2) }, db);

    months = await getCalendar("2026-11", 14, { db, now: at(2026, 12, 3) });
    const dec = months.find((m) => m.key === "2026-12")!;
    expect(dec.entries).toHaveLength(1);
    expect(dec.entries[0]).toMatchObject({ paid: true, amountCents: 14880 });
    expect(dec.paidCents).toBe(14880);
    // The next period shows up a year later, not twice in December.
    expect(months.find((m) => m.key === "2027-12")!.entries).toHaveLength(1);
  });

  it("leaves out cancelled packages", async () => {
    const { pkg } = await makePackage({ expiresAt: athensDay(2026, 12, 31) });
    await db.hostingPackage.update({ where: { id: pkg.id }, data: { status: "cancelled" } });
    const months = await getCalendar("2026-12", 1, { db, now: at(2026, 11, 13) });
    expect(months[0].entries).toHaveLength(0);
  });
});
