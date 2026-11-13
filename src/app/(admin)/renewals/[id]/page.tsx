import Link from "next/link";
import { notFound } from "next/navigation";
import {
  markPaidByBankTransfer,
  removePackageDomain,
  markRefunded,
  resendInvoice,
  retryInvoice,
  sendReminderNow,
  setPackageCancelled,
  setReminders,
} from "@/app/(admin)/actions";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader, Section } from "@/components/page-header";
import { ReminderSheet } from "@/components/reminder-sheet";
import { RenewalTimeline, type TimelineStep } from "@/components/renewal-timeline";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { addPeriod, daysLeft, formatDate, formatDateTime, formatShortDate } from "@/lib/dates";
import { missingInvoiceDetails } from "@/lib/elorus/client";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { documentTypeFor } from "@/lib/invoices/issue";
import { formatEur } from "@/lib/money";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { domainsOf, packageInclude } from "@/lib/queries";
import { reminderKindFor } from "@/lib/reminders/engine";
import { domainIsDue, parseLines, renewalLines } from "@/lib/renewal";
import { daysLeftLabel, packageStatus } from "@/lib/status";
import { EditPackageForm } from "./edit-form";
import { HostingAndDomains } from "./plan-domains";

const INVOICE_LABEL = { TPY: "ΤΠΥ", APY: "ΑΠΥ" } as const;
const REGIME_LABEL = { domestic: "Greek VAT 24%", eu_reverse_charge: "EU reverse charge (0%)", non_eu: "Outside EU (no VAT)" } as const;

export async function generateMetadata({ params }: PageProps<"/renewals/[id]">) {
  const { id } = await params;
  const p = await db.hostingPackage.findUnique({ where: { id }, include: { websites: { include: { website: true } } } });
  return { title: p ? domainsOf(p) : "Package" };
}

export default async function PackagePage({ params }: PageProps<"/renewals/[id]">) {
  const { id } = await params;
  const pkg = await db.hostingPackage.findUnique({
    where: { id },
    include: { ...packageInclude, paymentRequests: true, client: { include: { websites: { include: { packageDomain: true } } } } },
  });
  if (!pkg) notFound();

  const now = new Date();
  const d = daysLeft(pkg.expiresAt, now);
  const status = packageStatus(pkg, now);
  const domains = domainsOf(pkg);
  const pr = pkg.status === "cancelled" ? pkg.paymentRequests.find((r) => +r.periodEnd === +pkg.expiresAt) : await getOrCreatePaymentRequest(pkg.id);
  const plans = await db.plan.findMany({ orderBy: { name: "asc" } });
  const domainPlans = plans.filter((p) => p.kind === "domain" && p.active);
  const hostingPlans = plans.filter((p) => p.kind === "hosting" && p.active && p.priceNetCents > 0).sort((a, b) => a.priceNetCents - b.priceNetCents);
  const freeSites = pkg.client.websites.filter((w) => !w.packageDomain);
  const lines = parseLines(pr?.lines) ?? renewalLines(pkg);
  const activity = await db.auditLog.findMany({ where: { entity: "HostingPackage", entityId: id }, orderBy: { createdAt: "desc" }, take: 12 });
  const missing = missingInvoiceDetails(pkg.client);
  const locale = pkg.client.language;

  // ---- Current period timeline ----
  const periodReminders = pkg.reminders.filter((r) => +r.periodEnd === +pkg.expiresAt);
  const step = (kind: "d30" | "d7" | "d1", label: string, offset: number): TimelineStep => {
    const r = periodReminders.find((x) => x.kind === kind && x.seq === 0);
    if (r?.status === "sent") return { key: kind, label, state: "done", when: r.sentAt ? formatDateTime(r.sentAt) : undefined, detail: kind === "d1" ? "copy to team" : undefined };
    if (r?.status === "failed") return { key: kind, label: `${label} not sent`, state: "failed", detail: r.lastError ?? undefined };
    if (r?.status === "pending") return { key: kind, label, state: "current", detail: "Sending…" };
    const sendDay = new Date(pkg.expiresAt.getTime() - offset * 86400_000);
    const windowLow = { d30: 8, d7: 2, d1: 0 }[kind];
    const laterSent = periodReminders.some((x) => x.status === "sent" && x.seq === 0 && ({ d30: 0, d7: 1, d1: 2 } as Record<string, number>)[x.kind] > { d30: 0, d7: 1, d1: 2 }[kind]);
    if (laterSent || d < windowLow) return { key: kind, label, state: "skipped", detail: "Not sent: its window had passed" };
    return { key: kind, label, state: "upcoming", when: pkg.remindersEnabled ? `Sends ${formatShortDate(sendDay, "en")} at 09:00` : "Paused" };
  };
  const currentSteps: TimelineStep[] = [
    step("d30", "30-day reminder", 30),
    step("d7", "7-day reminder", 7),
    step("d1", "Day-before reminder", 1),
    pkg.status === "expired"
      ? { key: "pay", label: "Not paid", state: "failed", detail: `${-d} day${d === -1 ? "" : "s"} overdue${d <= -3 ? " · team alerted" : ""}` }
      : { key: "pay", label: "Client pays with Viva", state: "upcoming", when: `By ${formatShortDate(pkg.expiresAt, "en")}` },
    {
      key: "inv",
      label: `${INVOICE_LABEL[pkg.client.invoiceType]} issued in Elorus`,
      state: missing.length ? "failed" : "upcoming",
      detail: missing.length ? `Waiting for: ${missing.join(", ")}` : "Automatically after payment",
    },
    { key: "mail", label: "Invoice emailed to client", state: "upcoming", detail: pkg.client.emails.join(", ") || "No email" },
  ];

  // ---- Payments (previous renewals) ----
  const payments = pkg.payments;

  // ---- Reminder preview ----
  const emailKind = reminderKindFor(d) ?? (d > 30 ? "d30" : "overdue");
  const amount = formatEur(pr?.amountCents ?? 0, locale);
  const expiry = formatDate(pkg.expiresAt, locale);
  const preview = {
    to: pkg.client.emails,
    language: locale === "el" ? "Greek" : "English",
    subject: t[locale].reminderSubject[emailKind](domains, expiry),
    body: t[locale].reminderLead[emailKind](domains, expiry, amount),
    button: t[locale].payButton(amount),
  };
  const payUrl = pr ? `${env.appUrl}/pay/${pr.token}` : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/renewals" className="text-muted-foreground hover:text-foreground">
          ← Renewals
        </Link>
      </p>
      <PageHeader
        title={domains}
        subtitle={
          <>
            <Link href={`/clients/${pkg.client.id}`} className="underline-offset-2 hover:underline">
              {pkg.client.name}
            </Link>{" "}
            · {pkg.plan.name} · {pkg.plan.periodMonths === 24 ? "every 2 years" : "yearly"}
            {pkg.domains.length > 0 && ` · ${pkg.domains.length} domain${pkg.domains.length === 1 ? "" : "s"}`}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={status.primary} />
            {status.flags.map((f) => (
              <StatusBadge key={f.label} status={f} />
            ))}
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Section
            title={pkg.status === "cancelled" ? "Cancelled" : "This renewal"}
            description={
              pkg.status === "cancelled"
                ? "No reminders or pay links. Restore the package to resume."
                : `${formatDate(pkg.expiresAt, "en")} · ${daysLeftLabel(pkg.expiresAt, now)} · ${pr ? formatEur(pr.amountCents, "en") : ""}${pr && pr.vatCents ? ` incl. ${formatEur(pr.vatCents, "en")} VAT` : ""}`
            }
          >
            {pkg.status !== "cancelled" && (
              <div className="rounded-xl border bg-card p-5">
                <ul aria-label="This renewal charges" className="mb-5 space-y-1 border-b pb-4 text-sm">
                  {lines.map((l) => (
                    <li key={`${l.kind}-${l.label}`} className="flex justify-between gap-4">
                      <span>
                        {l.kind === "domain" ? `Domain ${l.label}` : `${pkg.plan.kind === "domain" ? "Domain" : "Hosting"} ${l.label}`}
                        <span className="text-muted-foreground"> · {l.periodMonths === 24 ? "2 years" : "1 year"}</span>
                      </span>
                      <span className="num">{formatEur(l.netCents, "en")} net</span>
                    </li>
                  ))}
                </ul>
                <RenewalTimeline steps={currentSteps} />
              </div>
            )}
          </Section>

          {pkg.status !== "cancelled" && (
            <Section title="Hosting & domains" description="What the client pays for. Domains renew on the same invoice as the hosting; a .gr domain every 2nd renewal.">
              <HostingAndDomains
                packageId={pkg.id}
                hostingPlans={hostingPlans.map((p) => ({ id: p.id, label: `${p.name} · ${formatEur(p.priceNetCents, "en")} net / year` }))}
                current={{
                  planId: pkg.planId,
                  customPrice: pkg.customPriceNetCents != null ? (pkg.customPriceNetCents / 100).toFixed(2) : "",
                }}
                missingHostingPlan={pkg.plan.kind !== "hosting" || pkg.plan.priceNetCents === 0}
                domainPlans={domainPlans.map((p) => ({
                  id: p.id,
                  name: p.name,
                  periodMonths: p.periodMonths,
                  label: `${p.name} · ${formatEur(p.priceNetCents, "en")} / ${p.periodMonths === 24 ? "2 years" : "year"}`,
                }))}
                freeSites={freeSites.map((w) => ({ id: w.id, domain: w.domain }))}
                thisRenewal={formatShortDate(pkg.expiresAt, "en")}
                nextRenewal={formatShortDate(addPeriod(pkg.expiresAt, pkg.plan.periodMonths), "en")}
                domainRows={
                  pkg.domains.length === 0 ? (
                    <p className="px-5 pb-1 text-sm text-muted-foreground">No domain renews with this package.</p>
                  ) : (
                    <ul className="divide-y">
                      {pkg.domains.map((d) => {
                        const dueNow = domainIsDue(d.expiresAt, pkg.expiresAt);
                        return (
                          <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-medium">{d.website.domain}</p>
                              <p className="text-[13px] text-muted-foreground">
                                {d.plan.name} · {formatEur(d.customPriceNetCents ?? d.plan.priceNetCents, "en")} net every{" "}
                                {d.plan.periodMonths === 24 ? "2 years" : "year"} · next {formatShortDate(d.expiresAt, "en")}
                              </p>
                            </div>
                            <StatusBadge status={dueNow ? { label: "In this renewal", tone: "progress", icon: "clock" } : { label: "Next time", tone: "muted", icon: "circle" }} />
                            <ActionButton
                              action={removePackageDomain.bind(null, d.id)}
                              variant="ghost"
                              size="sm"
                              confirm={{
                                title: `Stop renewing ${d.website.domain} here?`,
                                body: "The domain is removed from this package's renewals. Open pay links update. Add it again any time.",
                                confirmLabel: "Remove Domain",
                                destructive: true,
                              }}
                            >
                              Remove
                            </ActionButton>
                          </li>
                        );
                      })}
                    </ul>
                  )
                }
              />
            </Section>
          )}

          <Section title="Payments" description="Each payment with its Elorus invoice.">
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">No payments yet. The first one appears here when the client pays or you mark a bank transfer.</p>
            ) : (
              <ul className="space-y-3">
                {payments.map((p) => {
                  const inv = p.invoice;
                  const steps: TimelineStep[] = [
                    {
                      key: "paid",
                      label: p.status === "recorded" ? `Paid ${formatEur(p.amountCents, "en")} via ${p.provider === "bank_transfer" ? "bank transfer" : "Viva"}` : p.status === "refunded" ? `Refunded ${formatEur(p.amountCents, "en")}` : `Charged twice: ${formatEur(p.amountCents, "en")} needs a refund`,
                      state: p.status === "needs_refund" ? "failed" : "done",
                      when: formatDateTime(p.paidAt),
                      detail: p.transactionId.startsWith("bank:") ? undefined : `Transaction ${p.transactionId}`,
                    },
                  ];
                  if (p.status === "recorded" && inv) {
                    steps.push(
                      inv.status === "issued"
                        ? { key: "inv", label: `Invoice ${inv.number} issued`, state: "done", detail: documentTypeFor(pkg.client.invoiceType, pkg.client.vatRegime) }
                        : inv.status === "failed"
                          ? { key: "inv", label: "Invoice not issued", state: "failed", detail: inv.lastError ?? undefined }
                          : { key: "inv", label: "Issuing invoice…", state: "current", detail: inv.lastError ? `Retrying: ${inv.lastError}` : undefined },
                      inv.emailStatus === "sent" || inv.emailStatus === "delivered"
                        ? { key: "mail", label: "Invoice emailed", state: "done", when: inv.emailedAt ? formatDateTime(inv.emailedAt) : undefined }
                        : inv.emailStatus === "failed"
                          ? { key: "mail", label: "Invoice email failed", state: "failed" }
                          : { key: "mail", label: "Invoice email", state: "upcoming" },
                    );
                  }
                  return (
                    <li key={p.id} className="rounded-xl border bg-card p-5">
                      <RenewalTimeline steps={steps} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {p.status === "recorded" && inv && inv.status !== "issued" && (
                          <ActionButton action={retryInvoice.bind(null, p.id)} pendingLabel="Issuing…">
                            Retry Invoice
                          </ActionButton>
                        )}
                        {p.status === "recorded" && inv?.status === "issued" && inv.emailStatus !== "sent" && (
                          <ActionButton action={retryInvoice.bind(null, p.id)} pendingLabel="Sending…">
                            Send Invoice Email
                          </ActionButton>
                        )}
                        {p.status === "recorded" && inv?.status === "issued" && inv.emailStatus === "sent" && (
                          <ActionButton
                            action={resendInvoice.bind(null, p.id)}
                            pendingLabel="Sending…"
                            confirm={{ title: `Resend invoice ${inv.number}?`, body: `Elorus emails it again to ${pkg.client.emails.join(", ")}.`, confirmLabel: "Resend Invoice" }}
                          >
                            Resend Invoice
                          </ActionButton>
                        )}
                        {p.status === "needs_refund" && (
                          <ActionButton
                            action={markRefunded.bind(null, p.id)}
                            confirm={{
                              title: "Mark this charge as refunded?",
                              body: "Do this after you refund the transaction in the Viva dashboard. The app does not refund it for you.",
                              confirmLabel: "Mark Refunded",
                            }}
                          >
                            Mark Refunded
                          </ActionButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Details" description="Corrections only: expiry date, websites, notes.">
            <div className="rounded-xl border bg-card p-5">
              <EditPackageForm
                id={pkg.id}
                websites={pkg.client.websites.map((w) => ({ id: w.id, domain: w.domain }))}
                values={{
                  expiresAt: pkg.expiresAt,
                  notes: pkg.notes ?? "",
                  websiteIds: pkg.websites.map((w) => w.websiteId),
                }}
              />
            </div>
          </Section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-[15px] font-semibold">Actions</h2>
            {pkg.status === "cancelled" ? (
              <ActionButton action={setPackageCancelled.bind(null, pkg.id, false)} className="w-full">
                Restore Package
              </ActionButton>
            ) : (
              <div className="flex flex-col gap-2 [&>*]:w-full [&_button]:w-full">
                <ReminderSheet
                  preview={preview}
                  send={sendReminderNow.bind(null, pkg.id)}
                  disabledReason={pkg.client.emails.length ? undefined : "The client has no email address in Elorus"}
                />
                {pr?.status === "open" && (
                  <ActionButton
                    action={markPaidByBankTransfer.bind(null, pkg.id)}
                    pendingLabel="Issuing invoice…"
                    confirm={{
                      title: "Mark as paid by bank transfer?",
                      body: (
                        <div className="space-y-2">
                          <p>
                            This issues a <strong>{INVOICE_LABEL[pkg.client.invoiceType]}</strong> for <strong>{formatEur(pr.amountCents, "en")}</strong> to{" "}
                            <strong>{pkg.client.name}</strong>
                            {pkg.client.vatNumber ? ` (ΑΦΜ ${pkg.client.vatNumber})` : ""} in Elorus, sends it to myDATA, and emails it to the client.
                          </p>
                          {lines.length > 1 && <p>It covers {lines.map((l) => (l.kind === "domain" ? `domain ${l.label} (${l.periodMonths === 24 ? "2 years" : "1 year"})` : `hosting ${l.label}`)).join(" and ")}.</p>}
                          <p>The package renews until {formatDate(addPeriod(pkg.expiresAt, pkg.plan.periodMonths), "en")}. An issued invoice can only be reversed with a credit note.</p>
                          {missing.length > 0 && <p className="text-destructive">Elorus is missing: {missing.join(", ")}. The payment is recorded, but the invoice waits until you fix it.</p>}
                        </div>
                      ),
                      confirmLabel: "Issue Invoice",
                    }}
                  >
                    Mark Paid by Bank Transfer
                  </ActionButton>
                )}
                {payUrl && pr?.status === "open" && <CopyButton value={payUrl} />}
                <ActionButton action={setReminders.bind(null, pkg.id, !pkg.remindersEnabled)} variant="ghost">
                  {pkg.remindersEnabled ? "Pause Reminders" : "Resume Reminders"}
                </ActionButton>
                <ActionButton action={setPackageCancelled.bind(null, pkg.id, true)} variant="ghost" className="text-destructive">
                  Cancel Package
                </ActionButton>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 text-sm">
            <h2 className="mb-3 text-[15px] font-semibold">Invoicing</h2>
            <dl className="grid grid-cols-[92px_1fr] gap-y-1.5">
              <dt className="text-muted-foreground">Document</dt>
              <dd>{INVOICE_LABEL[pkg.client.invoiceType]}</dd>
              <dt className="text-muted-foreground">VAT</dt>
              <dd>{REGIME_LABEL[pkg.client.vatRegime]}</dd>
              <dt className="text-muted-foreground">Language</dt>
              <dd>{locale === "el" ? "Greek" : "English"}</dd>
              <dt className="text-muted-foreground">Emails</dt>
              <dd className="break-all">{pkg.client.emails.join(", ") || "—"}</dd>
            </dl>
            <Link href={`/clients/${pkg.client.id}`} className="mt-3 inline-block text-[13px] text-primary hover:underline">
              Edit client settings
            </Link>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-[15px] font-semibold">Activity</h2>
            {activity.length === 0 && pkg.reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {[
                  ...pkg.reminders.map((r) => ({
                    at: r.sentAt ?? r.createdAt,
                    text: `${r.kind === "manual" ? `Reminder sent by ${r.sentBy}` : r.kind === "overdue3d" ? "Overdue alert to team" : `Automatic ${r.kind.slice(1)}-day reminder`} · ${r.status}`,
                  })),
                  ...activity.filter((a) => a.action !== "reminder.manual").map((a) => ({ at: a.createdAt, text: `${a.action.replace(".", " ").replace("_", " ")} · ${a.actor}` })),
                ]
                  .sort((a, b) => +b.at - +a.at)
                  .slice(0, 12)
                  .map((e, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{e.text}</span>
                      <span className="shrink-0 text-muted-foreground num">{formatDateTime(e.at)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
