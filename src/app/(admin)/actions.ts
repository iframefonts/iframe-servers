"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addPeriod, parseAthensDate } from "@/lib/dates";
import { getElorus } from "@/lib/elorus/client";
import { cachedFields, syncClientFromElorus } from "@/lib/elorus/sync";
import { issueInvoice } from "@/lib/invoices/issue";
import { afterPayment } from "@/lib/jobs";
import { domainRe, normalizeDomain } from "@/lib/domains";
import { parseEurToCents } from "@/lib/money";
import { recordPayment } from "@/lib/payments/record";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";
import { runReminders, sendManualReminder } from "@/lib/reminders/engine";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

async function audit(actor: string, action: string, entity: string, entityId: string, data?: object) {
  await db.auditLog.create({ data: { actor, action, entity, entityId, data: data ?? undefined } });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------- Plans ----------------

const planSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["hosting", "domain"]),
  price: z.string(),
  periodMonths: z.coerce.number().int().refine((n) => n === 12 || n === 24, "Period is 12 or 24 months"),
  elorusProductId: z.string().trim().optional(),
});

export async function savePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const priceNetCents = parseEurToCents(parsed.data.price);
  if (priceNetCents === null) return { ok: false, message: "Enter the net price, for example 120 or 120,00" };
  const id = String(formData.get("id") ?? "");
  const data = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    priceNetCents,
    periodMonths: parsed.data.periodMonths,
    elorusProductId: parsed.data.elorusProductId || null,
  };
  const plan = id ? await db.plan.update({ where: { id }, data }) : await db.plan.create({ data });
  await audit(user.email, id ? "plan.updated" : "plan.created", "Plan", plan.id, data);
  revalidatePath("/plans");
  return { ok: true, message: id ? "Plan saved" : "Plan added" };
}

export async function setPlanActive(id: string, active: boolean) {
  const user = await requireUser();
  await db.plan.update({ where: { id }, data: { active } });
  await audit(user.email, active ? "plan.restored" : "plan.archived", "Plan", id);
  revalidatePath("/plans");
}

// ---------------- Clients (Elorus is the source of truth) ----------------

export async function searchElorus(q: string) {
  await requireUser();
  if (q.trim().length < 2) return [];
  const results = await getElorus().searchContacts(q.trim());
  const linked = await db.client.findMany({
    where: { elorusContactId: { in: results.map((r) => r.id) } },
    select: { id: true, elorusContactId: true },
  });
  return results.map((r) => ({ ...r, linkedClientId: linked.find((l) => l.elorusContactId === r.id)?.id ?? null }));
}

/** Link an Elorus contact: creates a new client, or links an imported (unlinked) client. */
export async function linkElorusContact(contactId: string, existingClientId?: string): Promise<ActionResult & { clientId?: string }> {
  const user = await requireUser();
  try {
    const contact = await getElorus().getContact(contactId);
    const data = { ...cachedFields(contact), elorusContactId: contact.id, syncedAt: new Date(), invoiceType: contact.isCompany ? ("TPY" as const) : ("APY" as const) };
    const client = existingClientId
      ? await db.client.update({ where: { id: existingClientId }, data })
      : await db.client.create({ data });
    await audit(user.email, "client.linked", "Client", client.id, { elorusContactId: contact.id });
    revalidatePath("/clients");
    return { ok: true, message: `Linked ${contact.name}`, clientId: client.id };
  } catch (e) {
    return { ok: false, message: errMsg(e).includes("Unique") ? "That Elorus contact is already linked to another client" : errMsg(e) };
  }
}

const newContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  isCompany: z.enum(["yes", "no"]),
  vatNumber: z.string().trim().optional(),
  taxOffice: z.string().trim().optional(),
  address: z.string().trim().optional(),
  email: z.email("Enter a valid email"),
  phone: z.string().trim().optional(),
});

export async function createElorusContact(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = newContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const isCompany = d.isCompany === "yes";
  if (isCompany && (!d.vatNumber || !d.taxOffice || !d.address)) {
    return { ok: false, message: "Businesses need ΑΦΜ, tax office and address for invoices" };
  }
  let clientId: string;
  try {
    const contact = await getElorus().createContact({
      name: d.name,
      company: isCompany ? d.name : undefined,
      isCompany,
      vatNumber: d.vatNumber,
      taxOffice: d.taxOffice,
      address: d.address,
      emails: [d.email],
      phone: d.phone,
    });
    const existing = String(formData.get("existingClientId") ?? "") || undefined;
    const res = await linkElorusContact(contact.id, existing);
    if (!res.ok || !res.clientId) return res;
    clientId = res.clientId;
    await audit(user.email, "elorus.contact.created", "Client", clientId, { elorusContactId: contact.id });
  } catch (e) {
    return { ok: false, message: `Elorus: ${errMsg(e)}` };
  }
  redirect(`/clients/${clientId}`);
}

export async function refreshClient(clientId: string): Promise<ActionResult> {
  await requireUser();
  try {
    await syncClientFromElorus(clientId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Details refreshed from Elorus" };
  } catch (e) {
    return { ok: false, message: `Couldn't reach Elorus: ${errMsg(e)}` };
  }
}

const extrasSchema = z.object({
  language: z.enum(["el", "en"]),
  invoiceType: z.enum(["TPY", "APY"]),
  vatRegime: z.enum(["domestic", "eu_reverse_charge", "non_eu"]),
  notes: z.string().optional(),
});

export async function saveClientExtras(clientId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = extrasSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.client.update({ where: { id: clientId }, data: { ...parsed.data, notes: parsed.data.notes || null } });
  await audit(user.email, "client.extras", "Client", clientId, parsed.data);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "Saved" };
}

export async function addWebsite(clientId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  if (!domainRe.test(domain)) return { ok: false, message: "Enter a domain like example.gr" };
  const server = String(formData.get("server") ?? "").trim() || null;
  try {
    const w = await db.website.create({ data: { clientId, domain, server } });
    await audit(user.email, "website.added", "Website", w.id, { domain });
  } catch {
    return { ok: false, message: `${domain} already belongs to a client` };
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: `Added ${domain}` };
}

export async function removeWebsite(websiteId: string): Promise<ActionResult> {
  const user = await requireUser();
  const w = await db.website.findUniqueOrThrow({ where: { id: websiteId }, include: { packages: true } });
  if (w.packages.length) return { ok: false, message: "Remove it from its hosting package first" };
  await db.website.delete({ where: { id: websiteId } });
  await audit(user.email, "website.removed", "Website", websiteId, { domain: w.domain });
  revalidatePath(`/clients/${w.clientId}`);
  return { ok: true, message: `Removed ${w.domain}` };
}

// ---------------- Packages ----------------

const pkgSchema = z.object({
  clientId: z.string().min(1, "Choose a client"),
  planId: z.string().min(1, "Choose a plan"),
  startDate: z.string().min(1, "Choose a start date"),
  expiresAt: z.string().optional(),
  customPrice: z.string().optional(),
  notes: z.string().optional(),
});

export async function createPackage(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = pkgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const websiteIds = formData.getAll("websiteIds").map(String).filter(Boolean);
  if (websiteIds.length === 0) return { ok: false, message: "Choose at least one website" };
  const start = parseAthensDate(parsed.data.startDate);
  if (!start) return { ok: false, message: "Start date is not valid" };
  const plan = await db.plan.findUniqueOrThrow({ where: { id: parsed.data.planId } });
  if (plan.kind !== "hosting") return { ok: false, message: "Choose a hosting plan. Domains are added on the package page." };
  const expiresAt = parsed.data.expiresAt ? parseAthensDate(parsed.data.expiresAt) : addPeriod(start, plan.periodMonths);
  if (!expiresAt) return { ok: false, message: "Expiry date is not valid" };
  let customPriceNetCents: number | null = null;
  if (parsed.data.customPrice) {
    customPriceNetCents = parseEurToCents(parsed.data.customPrice);
    if (customPriceNetCents === null) return { ok: false, message: "Custom price is not a valid amount" };
  }
  // Optional domain renewed with the hosting, on its own domain plan.
  let domain: { websiteId: string; planId: string; customPriceNetCents: number | null; expiresAt: Date } | null = null;
  if (formData.get("withDomain")) {
    const domainPlan = await db.plan.findUnique({ where: { id: String(formData.get("domainPlanId") ?? "") } });
    if (!domainPlan || domainPlan.kind !== "domain") return { ok: false, message: "Choose a domain plan" };
    const site = await db.website.findFirst({ where: { id: String(formData.get("domainWebsiteId") ?? ""), clientId: parsed.data.clientId } });
    if (!site) return { ok: false, message: "Choose the domain" };
    const rawPrice = String(formData.get("domainCustomPrice") ?? "").trim();
    const domainPrice = rawPrice ? parseEurToCents(rawPrice) : null;
    if (rawPrice && domainPrice === null) return { ok: false, message: "Domain price is not a valid amount" };
    const second = formData.get("domainFirstRenewal") === "next";
    domain = { websiteId: site.id, planId: domainPlan.id, customPriceNetCents: domainPrice, expiresAt: second ? addPeriod(expiresAt, plan.periodMonths) : expiresAt };
  }
  let pkg;
  try {
    pkg = await db.hostingPackage.create({
      data: {
        clientId: parsed.data.clientId,
        planId: plan.id,
        startDate: start,
        expiresAt,
        customPriceNetCents,
        notes: parsed.data.notes || null,
        websites: { create: websiteIds.map((websiteId) => ({ websiteId })) },
        ...(domain ? { domains: { create: [domain] } } : {}),
      },
    });
  } catch (e) {
    return { ok: false, message: isUnique(e) ? "That domain already renews with another package" : errMsg(e) };
  }
  await audit(user.email, "package.created", "HostingPackage", pkg.id);
  redirect(`/renewals/${pkg.id}`);
}

const editSchema = z.object({
  expiresAt: z.string().min(1),
  notes: z.string().optional(),
});

export async function updatePackage(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const expiresAt = parseAthensDate(parsed.data.expiresAt);
  if (!expiresAt) return { ok: false, message: "Expiry date is not valid" };
  const websiteIds = formData.getAll("websiteIds").map(String).filter(Boolean);
  if (websiteIds.length === 0) return { ok: false, message: "Keep at least one website" };
  await db.$transaction([
    db.hostingPackage.update({
      where: { id },
      data: { expiresAt, notes: parsed.data.notes || null },
    }),
    db.packageWebsite.deleteMany({ where: { packageId: id } }),
    db.packageWebsite.createMany({ data: websiteIds.map((websiteId) => ({ packageId: id, websiteId })) }),
  ]);
  await audit(user.email, "package.updated", "HostingPackage", id, parsed.data);
  revalidatePath(`/renewals/${id}`);
  return { ok: true, message: "Package saved" };
}

/** The package's hosting plan and optional custom price. Hosting plans only. */
export async function setPackagePlan(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const plan = await db.plan.findUnique({ where: { id: String(formData.get("planId") ?? "") } });
  if (!plan) return { ok: false, message: "Choose a hosting plan" };
  if (plan.kind !== "hosting") return { ok: false, message: "Choose a hosting plan. Add domains under Domains." };
  const raw = String(formData.get("customPrice") ?? "").trim();
  const customPriceNetCents = raw ? parseEurToCents(raw) : null;
  if (raw && customPriceNetCents === null) return { ok: false, message: "Custom price is not a valid amount, for example 120 or 120,00" };
  await db.hostingPackage.update({ where: { id }, data: { planId: plan.id, customPriceNetCents } });
  await audit(user.email, "package.plan", "HostingPackage", id, { plan: plan.name, customPriceNetCents });
  revalidatePath(`/renewals/${id}`);
  return { ok: true, message: customPriceNetCents !== null ? `Hosting: ${plan.name} at a custom €${(customPriceNetCents / 100).toFixed(2)} net` : `Hosting: ${plan.name}` };
}

// ---------------- Domains renewed with a package ----------------

const domainSchema = z.object({
  websiteId: z.string().min(1, "Choose the domain"),
  planId: z.string().min(1, "Choose a domain plan"),
  firstRenewal: z.enum(["this", "next"]),
  customPrice: z.string().optional(),
});

/** Adds a domain that renews together with the hosting, starting with this or the next renewal. */
export async function addPackageDomain(packageId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = domainSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const pkg = await db.hostingPackage.findUniqueOrThrow({ where: { id: packageId }, include: { plan: true } });
  const plan = await db.plan.findUniqueOrThrow({ where: { id: parsed.data.planId } });
  if (plan.kind !== "domain") return { ok: false, message: "Choose a domain plan" };
  let customPriceNetCents: number | null = null;
  if (parsed.data.customPrice) {
    customPriceNetCents = parseEurToCents(parsed.data.customPrice);
    if (customPriceNetCents === null) return { ok: false, message: "Custom price is not a valid amount" };
  }
  const expiresAt = parsed.data.firstRenewal === "this" ? pkg.expiresAt : addPeriod(pkg.expiresAt, pkg.plan.periodMonths);
  try {
    const d = await db.packageDomain.create({
      data: { packageId, websiteId: parsed.data.websiteId, planId: plan.id, customPriceNetCents, expiresAt },
      include: { website: true },
    });
    await audit(user.email, "domain.added", "HostingPackage", packageId, { domain: d.website.domain, firstRenewal: parsed.data.firstRenewal });
    revalidatePath(`/renewals/${packageId}`);
    return { ok: true, message: `${d.website.domain} renews with this package` };
  } catch (e) {
    return { ok: false, message: isUnique(e) ? "That domain is already renewed with a package" : errMsg(e) };
  }
}

export async function removePackageDomain(domainId: string): Promise<ActionResult> {
  const user = await requireUser();
  const d = await db.packageDomain.delete({ where: { id: domainId }, include: { website: true } });
  await audit(user.email, "domain.removed", "HostingPackage", d.packageId, { domain: d.website.domain });
  revalidatePath(`/renewals/${d.packageId}`);
  return { ok: true, message: `${d.website.domain} no longer renews with this package` };
}

const isUnique = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** Bulk action on the Renewals list: one plan for many packages. Undoable, so no confirm. */
export async function bulkSetPlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))];
  const planId = String(formData.get("planId") ?? "");
  if (ids.length === 0) return { ok: false, message: "Select at least one package" };
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, message: "Choose a plan" };
  if (plan.kind !== "hosting") return { ok: false, message: "Choose a hosting plan" };
  const { count } = await db.hostingPackage.updateMany({ where: { id: { in: ids } }, data: { planId: plan.id } });
  await db.auditLog.createMany({
    data: ids.map((id) => ({ actor: user.email, action: "package.plan_bulk", entity: "HostingPackage", entityId: id, data: { planId: plan.id, plan: plan.name } })),
  });
  revalidatePath("/renewals");
  revalidatePath("/");
  return { ok: true, message: `${count} package${count === 1 ? "" : "s"} now on ${plan.name}` };
}

export async function setReminders(id: string, enabled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await db.hostingPackage.update({ where: { id }, data: { remindersEnabled: enabled } });
  await audit(user.email, enabled ? "reminders.resumed" : "reminders.paused", "HostingPackage", id);
  revalidatePath(`/renewals/${id}`);
  return { ok: true, message: enabled ? "Reminders resumed" : "Reminders paused" };
}

export async function setPackageCancelled(id: string, cancelled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const pkg = await db.hostingPackage.findUniqueOrThrow({ where: { id } });
  await db.hostingPackage.update({
    where: { id },
    data: { status: cancelled ? "cancelled" : pkg.expiresAt < new Date() ? "expired" : "active" },
  });
  if (cancelled) {
    await db.paymentRequest.updateMany({ where: { packageId: id, status: "open" }, data: { status: "cancelled" } });
  } else {
    await db.paymentRequest.updateMany({ where: { packageId: id, status: "cancelled" }, data: { status: "open" } });
  }
  await audit(user.email, cancelled ? "package.cancelled" : "package.restored", "HostingPackage", id);
  revalidatePath(`/renewals/${id}`);
  return { ok: true, message: cancelled ? "Package cancelled" : "Package restored" };
}

export async function sendReminderNow(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const { ok, reminder } = await sendManualReminder(id, user.email);
  await audit(user.email, "reminder.manual", "HostingPackage", id, { reminderId: reminder.id, ok });
  revalidatePath(`/renewals/${id}`);
  return ok ? { ok: true, message: "Reminder sent" } : { ok: false, message: `Not sent: ${reminder.lastError}` };
}

/** Records a bank transfer and issues the Elorus invoice, exactly like an online payment. */
export async function markPaidByBankTransfer(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const pr = await getOrCreatePaymentRequest(id);
  if (pr.status !== "open") return { ok: false, message: "This period is already paid" };
  const result = await recordPayment({
    provider: "bank_transfer",
    transactionId: `bank:${pr.id}`,
    paymentRequestId: pr.id,
    amountCents: pr.amountCents,
    paidAt: new Date(),
  });
  await audit(user.email, "payment.bank_transfer", "HostingPackage", id, { outcome: result.outcome });
  if (result.outcome !== "recorded") return { ok: false, message: "This period is already paid" };
  await afterPayment(result);
  revalidatePath(`/renewals/${id}`);
  const inv = await db.invoice.findUnique({ where: { paymentId: result.paymentId } });
  return inv?.status === "issued"
    ? { ok: true, message: `Paid. Invoice ${inv.number} issued and emailed.` }
    : { ok: true, message: "Paid. The invoice is being issued; check this page in a minute." };
}

export async function retryInvoice(paymentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  try {
    const inv = await issueInvoice(paymentId);
    await audit(user.email, "invoice.retry", "Payment", paymentId);
    revalidatePath(`/renewals/${p.packageId}`);
    return inv.status === "issued" && inv.emailStatus === "sent"
      ? { ok: true, message: `Invoice ${inv.number} issued and emailed` }
      : { ok: false, message: inv.lastError ?? "Still not issued" };
  } catch (e) {
    revalidatePath(`/renewals/${p.packageId}`);
    return { ok: false, message: errMsg(e) };
  }
}

export async function resendInvoice(paymentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true, package: { include: { client: true } } } });
  if (!p.invoice?.elorusInvoiceId) return { ok: false, message: "No invoice yet" };
  try {
    await getElorus().emailInvoice({ invoiceId: p.invoice.elorusInvoiceId, to: p.package.client.emails });
    await db.invoice.update({ where: { id: p.invoice.id }, data: { emailStatus: "sent", emailedAt: new Date() } });
    await audit(user.email, "invoice.resent", "Payment", paymentId);
    revalidatePath(`/renewals/${p.packageId}`);
    return { ok: true, message: `Invoice ${p.invoice.number} sent to ${p.package.client.emails.join(", ")}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function markRefunded(paymentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await db.payment.update({ where: { id: paymentId, status: "needs_refund" }, data: { status: "refunded" } });
  await audit(user.email, "payment.refunded", "Payment", paymentId);
  revalidatePath(`/renewals/${p.packageId}`);
  return { ok: true, message: "Marked as refunded" };
}

// ---------------- Settings ----------------

export async function runRemindersNow(): Promise<ActionResult> {
  const user = await requireUser();
  const s = await runReminders();
  await audit(user.email, "reminders.run", "System", "reminders", s);
  revalidatePath("/");
  return {
    ok: true,
    message: `Sent ${s.sent} reminder${s.sent === 1 ? "" : "s"}, ${s.failed} failed, ${s.expired} marked expired, ${s.overdueAlerts} overdue alert${s.overdueAlerts === 1 ? "" : "s"}`,
  };
}
