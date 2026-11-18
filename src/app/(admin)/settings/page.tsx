import { runRemindersNow } from "@/app/(admin)/actions";
import { ActionButton } from "@/components/action-button";
import { PageHeader, Section } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getElorus } from "@/lib/elorus/client";
import { env, mock } from "@/lib/env";
import { providerHealth } from "@/lib/payments/providers";
import type { Status } from "@/lib/status";

export const metadata = { title: "Settings" };

const badge = (s: "ok" | "mock" | "error" | "off"): Status =>
  s === "ok"
    ? { label: "Connected", tone: "done", icon: "check" }
    : s === "mock"
      ? { label: "Test mode", tone: "muted", icon: "pause" }
      : s === "off"
        ? { label: "Not set up", tone: "muted", icon: "pause" }
        : { label: "Not responding", tone: "action", icon: "alert" };

export default async function SettingsPage() {
  const [pay, elorus] = await Promise.all([
    providerHealth(),
    mock.elorus ? Promise.resolve("mock" as const) : getElorus().ping().then(() => "ok" as const, () => "error" as const),
  ]);
  const checks = [
    { name: "Viva Smart Checkout", status: pay.viva, note: mock.viva ? "Add VIVA_CLIENT_ID and VIVA_CLIENT_SECRET (demo first)." : `${env.viva.env} environment` },
    { name: "Elorus", status: elorus, note: mock.elorus ? "Add ELORUS_TOKEN and ELORUS_ORG_ID (use a test organization first)." : `Organization ${env.elorus.orgId}` },
    { name: "Email (Resend)", status: mock.email ? ("mock" as const) : ("ok" as const), note: mock.email ? "Add RESEND_API_KEY and verify the sending domain (SPF, DKIM)." : env.emailFrom },
    { name: "Background jobs (Inngest)", status: env.inngestEnabled ? ("ok" as const) : ("off" as const), note: env.inngestEnabled ? "Invoice jobs and reminder retries run on Inngest." : "Without Inngest, invoices are issued inline and failed reminders retry on the next run." },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Connections and the fixed rules the app runs on. Change rarely." />

      <Section title="Connections">
        <ul className="divide-y rounded-xl border bg-card">
          {checks.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{c.name}</p>
                <p className="text-[13px] text-muted-foreground">{c.note}</p>
              </div>
              <StatusBadge status={badge(c.status)} />
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Reminders">
          <div className="space-y-3 rounded-xl border bg-card p-5 text-sm">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2">
              <dt className="text-muted-foreground">Runs</dt>
              <dd>Daily at 09:00 Athens time</dd>
              <dt className="text-muted-foreground">Month reminder</dt>
              <dd>30 to 8 days before expiry</dd>
              <dt className="text-muted-foreground">Week reminder</dt>
              <dd>7 to 2 days before</dd>
              <dt className="text-muted-foreground">Day before</dt>
              <dd>1 or 0 days before, copy to {env.adminEmail}</dd>
              <dt className="text-muted-foreground">Overdue</dt>
              <dd>Team alert 3 days after expiry. The client isn&apos;t emailed and the site stays online.</dd>
              <dt className="text-muted-foreground">Sender</dt>
              <dd className="break-all">{env.emailFrom}</dd>
            </dl>
            <ActionButton action={runRemindersNow} pendingLabel="Running…">
              Run Reminders Now
            </ActionButton>
            <p className="text-[13px] text-muted-foreground">Safe to run any time: a reminder is never sent twice for the same period.</p>
          </div>
        </Section>

        <Section title="Email templates" description="Edited in code (src/emails). Preview them here.">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {(["d30", "d7", "d1", "overdue"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3 px-5 py-2.5">
                <span className="flex-1">{{ d30: "Month reminder", d7: "Week reminder", d1: "Day before", overdue: "Expired (manual send)" }[k]}</span>
                <a className="text-primary hover:underline" href={`/settings/preview?kind=${k}&lang=el`} target="_blank" rel="noreferrer">
                  Greek
                </a>
                <a className="text-primary hover:underline" href={`/settings/preview?kind=${k}&lang=en`} target="_blank" rel="noreferrer">
                  English
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Team">
        <div className="rounded-xl border bg-card p-5 text-sm">
          <p className="mb-2 text-muted-foreground">These addresses can sign in (ALLOWED_EMAILS):</p>
          <p>{env.allowedEmails.join(", ") || "None set"}</p>
          <p className="mt-3 text-muted-foreground">Team alerts and the daily digest go to {env.adminEmail}.</p>
        </div>
      </Section>
    </>
  );
}
