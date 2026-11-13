import { inngest } from "@/inngest/client";
import { syncAllClients } from "@/lib/elorus/sync";
import { issueInvoice } from "@/lib/invoices/issue";
import { retryReminders, runReminders } from "@/lib/reminders/engine";

export const issueInvoiceFn = inngest.createFunction(
  // retries: 4 → 5 attempts in total, matching MAX_INVOICE_ATTEMPTS
  { id: "issue-invoice", retries: 4, triggers: [{ event: "invoice/issue" }] },
  async ({ event, step }) => {
    const paymentId = (event.data as { paymentId: string }).paymentId;
    const inv = await step.run("issue", () => issueInvoice(paymentId));
    return { number: inv.number };
  },
);

/** Retries failed or stuck reminder sends within minutes, not the next day. */
export const retryRemindersFn = inngest.createFunction(
  { id: "retry-reminders", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => step.run("retry", () => retryReminders()),
);

/** Backup schedule; Vercel Cron also calls /api/cron/reminders. The run is idempotent. */
export const dailyRemindersFn = inngest.createFunction(
  { id: "daily-reminders", triggers: [{ cron: "TZ=Europe/Athens 0 9 * * *" }] },
  async ({ step }) => step.run("run", () => runReminders()),
);

export const nightlySyncFn = inngest.createFunction(
  { id: "nightly-elorus-sync", triggers: [{ cron: "TZ=Europe/Athens 0 3 * * *" }] },
  async ({ step }) => step.run("sync", () => syncAllClients()),
);

export const functions = [issueInvoiceFn, retryRemindersFn, dailyRemindersFn, nightlySyncFn];
