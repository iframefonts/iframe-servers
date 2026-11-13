import { beforeEach, describe, expect, it } from "vitest";
import { athensDay, daysLeft } from "@/lib/dates";
import { MemoryMailer } from "@/lib/email/send";
import { reminderKindFor, retryReminders, runReminders } from "@/lib/reminders/engine";
import { recordPayment } from "@/lib/payments/record";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { at, db, makePackage, reset } from "./helpers";

const expiry = athensDay(2026, 12, 31);
const clientMails = (m: MemoryMailer) => m.sent.filter((e) => !e.to.includes("info@iframe.gr"));

describe("windows", () => {
  it("maps days left to the right reminder", () => {
    expect([31, 30, 8, 7, 2, 1, 0, -1].map(reminderKindFor)).toEqual([null, "d30", "d30", "d7", "d7", "d1", "d1", null]);
  });
  it("counts days in Athens time, across DST", () => {
    expect(daysLeft(athensDay(2026, 3, 30), at(2026, 3, 28))).toBe(2); // DST starts 29 Mar
    expect(daysLeft(expiry, new Date("2026-12-30T22:30:00Z"))).toBe(0); // 00:30 on 31 Dec in Athens
  });
});

describe("runReminders", () => {
  beforeEach(reset);

  it("sends each reminder once per period, even if the run repeats", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 1) }); // 30 days
    await runReminders({ db, mailer, now: at(2026, 12, 1) });
    await runReminders({ db, mailer, now: at(2026, 12, 2) }); // still in the 30–8 window
    expect(clientMails(mailer)).toHaveLength(1);
    expect(clientMails(mailer)[0].subject).toContain("ανανεώνεται");
  });

  it("a missed day never skips a reminder", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 20) }); // 11 days: month reminder
    // Runs on 24 Dec (7 days) and 30 Dec (1 day) were missed; 26 Dec is 5 days.
    await runReminders({ db, mailer, now: at(2026, 12, 26) });
    await runReminders({ db, mailer, now: at(2026, 12, 31) }); // 0 days: day-before window
    const kinds = await db.reminder.findMany({ orderBy: { createdAt: "asc" }, select: { kind: true, status: true } });
    expect(kinds.map((k) => k.kind)).toEqual(["d30", "d7", "d1"]);
    expect(kinds.every((k) => k.status === "sent")).toBe(true);
  });

  it("copies the day-before reminder to the team", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 30) });
    const mail = clientMails(mailer)[0];
    expect(mail.cc).toEqual(["info@iframe.gr"]);
  });

  it("stops reminding once the period is paid", async () => {
    const { pkg } = await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 1) });
    const pr = await getOrCreatePaymentRequest(pkg.id, { db });
    await recordPayment({ provider: "viva", transactionId: "t1", paymentRequestId: pr.id, amountCents: pr.amountCents, paidAt: at(2026, 12, 2) }, db);
    await runReminders({ db, mailer, now: at(2026, 12, 26) });
    expect(clientMails(mailer)).toHaveLength(1);
  });

  it("a failed send is kept and retried, not deleted", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    mailer.failNext = 1;
    const s = await runReminders({ db, mailer, now: at(2026, 12, 30) });
    expect(s.failed).toBe(1);
    expect((await db.reminder.findFirstOrThrow()).status).toBe("failed");
    await retryReminders({ db, mailer, now: at(2026, 12, 30) });
    const r = await db.reminder.findFirstOrThrow();
    expect(r.status).toBe("sent");
    expect(r.attempts).toBe(2);
    expect(clientMails(mailer)).toHaveLength(1);
  });

  it("a client without email shows as failed instead of silently skipping", async () => {
    await makePackage({ expiresAt: expiry, emails: [] });
    const s = await runReminders({ db, mailer: new MemoryMailer(), now: at(2026, 12, 20) });
    expect(s.failed).toBe(1);
    expect((await db.reminder.findFirstOrThrow()).lastError).toMatch(/no email/);
  });

  it("expires the package, alerts the team once at +3 days, and never emails the client", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2027, 1, 1) });
    expect((await db.hostingPackage.findFirstOrThrow()).status).toBe("expired");
    const before = clientMails(mailer).length;
    await runReminders({ db, mailer, now: at(2027, 1, 3) }); // 3 days overdue
    await runReminders({ db, mailer, now: at(2027, 1, 4) });
    const alerts = mailer.sent.filter((m) => m.subject.startsWith("Overdue"));
    expect(alerts).toHaveLength(1);
    expect(clientMails(mailer).length).toBe(before);
  });

  it("sends the team digest once a day", async () => {
    await makePackage({ expiresAt: expiry });
    const mailer = new MemoryMailer();
    await runReminders({ db, mailer, now: at(2026, 12, 20) });
    await runReminders({ db, mailer, now: at(2026, 12, 20) });
    expect(mailer.sent.filter((m) => m.subject.startsWith("Hosting digest"))).toHaveLength(1);
  });
});
