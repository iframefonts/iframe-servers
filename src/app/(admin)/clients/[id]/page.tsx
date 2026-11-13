import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addWebsite, refreshClient, removeWebsite, saveClientExtras } from "@/app/(admin)/actions";
import { ActionButton } from "@/components/action-button";
import { ElorusSearch } from "@/components/elorus-search";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { LinkButton } from "@/components/link-button";
import { NewContactForm } from "@/components/new-contact-form";
import { PageHeader, Section } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { formatDateTime, formatShortDate } from "@/lib/dates";
import { getElorus, missingInvoiceDetails } from "@/lib/elorus/client";
import { mock } from "@/lib/env";
import { formatEur } from "@/lib/money";
import { packageInclude } from "@/lib/queries";
import { packageStatus } from "@/lib/status";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const c = await db.client.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { websites: { orderBy: { domain: "asc" }, include: { packages: true } }, packages: { include: packageInclude, orderBy: { expiresAt: "asc" } } },
  });
  if (!client) notFound();
  const missing = missingInvoiceDetails(client);
  const linked = Boolean(client.elorusContactId);

  let elorusInvoices: Awaited<ReturnType<ReturnType<typeof getElorus>["listInvoices"]>> | null = null;
  let elorusError = false;
  if (linked) {
    try {
      elorusInvoices = await getElorus().listInvoices(client.elorusContactId!);
    } catch {
      elorusError = true;
    }
  }
  const elorusUrl = linked && !mock.elorus ? `https://app.elorus.com/contacts/${client.elorusContactId}/` : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/clients" className="text-muted-foreground hover:text-foreground">
          ← Clients
        </Link>
      </p>
      <PageHeader
        title={client.name}
        subtitle={linked ? (client.syncedAt ? `Synced from Elorus ${formatDateTime(client.syncedAt)}` : "Linked to Elorus") : "Not linked to Elorus yet"}
        actions={
          linked ? (
            <>
              <ActionButton action={refreshClient.bind(null, client.id)} pendingLabel="Refreshing…">
                Refresh from Elorus
              </ActionButton>
              {elorusUrl && (
                <a href={elorusUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
                  Open in Elorus <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </>
          ) : undefined
        }
      />

      {!linked && (
        <Section title="Link to Elorus" description="Invoices can't be issued until this client is linked to an Elorus contact. Reminders still go out if it has an email.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-[15px] font-semibold">Find the contact</h3>
              <ElorusSearch existingClientId={client.id} />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-[15px] font-semibold">Or create it in Elorus</h3>
              <NewContactForm existingClientId={client.id} defaults={{ name: client.name, email: client.emails[0] }} />
            </div>
          </div>
        </Section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Tax details" description={linked ? "Read-only. Change them in Elorus, then refresh." : undefined}>
          <div className="rounded-xl border bg-card p-5 text-sm">
            {missing.length > 0 && (
              <div className="mb-4">
                <StatusBadge status={{ label: "Missing tax details", tone: "action", icon: "alert", detail: missing.join(", ") }} />
                <p className="mt-2 text-[13px] text-muted-foreground">Reminders still go out. Invoicing waits until these are filled in Elorus.</p>
              </div>
            )}
            <dl className="grid grid-cols-[110px_1fr] gap-y-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{client.name}</dd>
              <dt className="text-muted-foreground">ΑΦΜ</dt>
              <dd className="num">{client.vatNumber ?? "—"}</dd>
              <dt className="text-muted-foreground">Tax office</dt>
              <dd>{client.taxOffice ?? "—"}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd>{client.address ?? "—"}</dd>
              <dt className="text-muted-foreground">Emails</dt>
              <dd className="break-all">{client.emails.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{client.phone ?? "—"}</dd>
            </dl>
          </div>
        </Section>

        <Section title="Billing settings" description="Kept in this app only.">
          <div className="rounded-xl border bg-card p-5">
            <ActionForm action={saveClientExtras.bind(null, client.id)} submitLabel="Save">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email language" htmlFor="language">
                  <NativeSelect id="language" name="language" defaultValue={client.language}>
                    <option value="el">Greek</option>
                    <option value="en">English</option>
                  </NativeSelect>
                </Field>
                <Field label="Document" htmlFor="invoiceType">
                  <NativeSelect id="invoiceType" name="invoiceType" defaultValue={client.invoiceType}>
                    <option value="TPY">ΤΠΥ (business)</option>
                    <option value="APY">ΑΠΥ (individual)</option>
                  </NativeSelect>
                </Field>
                <Field label="VAT" htmlFor="vatRegime" hint="EU businesses need a VIES-valid VAT number for reverse charge. Confirm with the accountant.">
                  <NativeSelect id="vatRegime" name="vatRegime" defaultValue={client.vatRegime}>
                    <option value="domestic">Greek VAT 24%</option>
                    <option value="eu_reverse_charge">EU business, reverse charge 0%</option>
                    <option value="non_eu">Outside the EU, no VAT</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" name="notes" defaultValue={client.notes ?? ""} rows={2} />
              </Field>
            </ActionForm>
          </div>
        </Section>
      </div>

      <Section title="Websites">
        <div className="rounded-xl border bg-card">
          {client.websites.length > 0 && (
            <ul className="divide-y">
              {client.websites.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1 text-[15px]">{w.domain}</span>
                  {w.server && <span className="text-[13px] text-muted-foreground">{w.server}</span>}
                  {w.packages.length === 0 ? (
                    <ActionButton action={removeWebsite.bind(null, w.id)} variant="ghost" size="sm">
                      Remove
                    </ActionButton>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">on a package</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t p-5 first:border-t-0">
            <ActionForm action={addWebsite.bind(null, client.id)} submitLabel="Add Website" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <Field label="Domain" htmlFor="domain">
                  <Input id="domain" name="domain" placeholder="example.gr" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </Field>
                <Field label="Server (optional)" htmlFor="server">
                  <Input id="server" name="server" placeholder="e.g. vps-2" />
                </Field>
              </div>
            </ActionForm>
          </div>
        </div>
      </Section>

      <Section
        title="Hosting packages"
        actions={client.websites.length ? <LinkButton href={`/renewals/new?client=${client.id}`}>New Package</LinkButton> : undefined}
      >
        {client.packages.length === 0 ? (
          <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">No packages yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {client.packages.map((p) => (
              <li key={p.id}>
                <Link href={`/renewals/${p.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/50">
                  <span className="flex-1 text-[15px] font-medium">{p.websites.map((w) => w.website.domain).join(", ") || p.plan.name}</span>
                  <span className="text-[13px] text-muted-foreground num">
                    {p.plan.name} · expires {formatShortDate(p.expiresAt, "en")}
                  </span>
                  <StatusBadge status={packageStatus(p).primary} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {linked && (
        <Section title="Elorus invoices" description="Paid and unpaid invoices for this contact, straight from Elorus.">
          {elorusError ? (
            <p className="text-sm text-destructive">Couldn&apos;t load invoices from Elorus. Try Refresh, or check the connection in Settings.</p>
          ) : !elorusInvoices?.length ? (
            <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">No invoices in Elorus for this contact.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {elorusInvoices.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1 font-medium">{i.number}</span>
                  <span className="text-muted-foreground num">{i.date}</span>
                  <span className="w-24 text-right num">{formatEur(i.totalCents, "en")}</span>
                  <StatusBadge status={i.paid ? { label: "Paid", tone: "done", icon: "check" } : { label: "Unpaid", tone: "action", icon: "alert" }} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
