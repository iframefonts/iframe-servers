import { beforeEach, describe, expect, it } from "vitest";
import { athensDay } from "@/lib/dates";
import { MemoryMailer } from "@/lib/email/send";
import { runReminders, sendManualReminder } from "@/lib/reminders/engine";
import { parseSheet } from "../scripts/import-sheet";
import { at, db, makePackage, reset } from "./helpers";

describe("manual reminders", () => {
  beforeEach(reset);
  it("can be sent repeatedly and never block the automatic ones", async () => {
    const { pkg } = await makePackage({ expiresAt: athensDay(2026, 12, 31) });
    const mailer = new MemoryMailer();
    await sendManualReminder(pkg.id, "info@iframe.gr", { db, mailer, now: at(2026, 12, 1) });
    await sendManualReminder(pkg.id, "info@iframe.gr", { db, mailer, now: at(2026, 12, 1) });
    await runReminders({ db, mailer, now: at(2026, 12, 1) });
    const kinds = (await db.reminder.findMany()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["d30", "manual", "manual"]);
  });
  it("uses the expired wording for an overdue package", async () => {
    const { pkg } = await makePackage({ expiresAt: athensDay(2026, 12, 31) });
    const mailer = new MemoryMailer();
    await sendManualReminder(pkg.id, "info@iframe.gr", { db, mailer, now: at(2027, 1, 5) });
    expect(mailer.sent[0].subject).toContain("έχει λήξει");
  });
});

describe("sheet import parser", () => {
  const html = `<table>
    <tr><th></th><th>A</th><th>B</th></tr>
    <tr><th>1</th><td>Ιανουάριος</td><td>Φεβρουάριος</td></tr>
    <tr><th>2</th><td>https://www.Example.gr/</td><td>shop.gr + domain</td></tr>
    <tr><th>3</th><td>robinson-trip</td><td></td></tr>
    <tr><th>32</th><td></td><td>ΕΝΗΜΕΡΩΣΗ</td></tr>
  </table>`;
  it("reads month columns, cleans domains, flags the odd ones and skips the legend", () => {
    const rows = parseSheet(html);
    expect(rows.map((r) => [r.domain, r.month, r.valid])).toEqual([
      ["example.gr", 1, true],
      ["shop.gr", 2, true],
      ["robinson-trip", 1, false],
    ]);
    expect(rows[1].note).toMatch(/domain registration/);
  });
});
