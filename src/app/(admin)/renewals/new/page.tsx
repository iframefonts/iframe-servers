import Link from "next/link";
import { Field, NativeSelect } from "@/components/form-bits";
import { LinkButton } from "@/components/link-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { NewPackageForm } from "./new-package-form";

export const metadata = { title: "New Package" };

export default async function NewPackagePage({ searchParams }: PageProps<"/renewals/new">) {
  const sp = await searchParams;
  const clientId = typeof sp.client === "string" ? sp.client : "";
  const [clients, plans, domainPlans] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.plan.findMany({ where: { active: true, kind: "hosting", priceNetCents: { gt: 0 } }, orderBy: { priceNetCents: "asc" } }),
    db.plan.findMany({ where: { active: true, kind: "domain" }, orderBy: { priceNetCents: "asc" } }),
  ]);
  const client = clientId
    ? await db.client.findUnique({ where: { id: clientId }, include: { websites: { include: { packages: { include: { package: true } }, packageDomain: true } } } })
    : null;

  if (plans.length === 0) {
    return (
      <>
        <PageHeader title="New Package" />
        <EmptyState title="Add a hosting plan first" body="Packages are priced from a hosting plan." action={<LinkButton href="/plans" variant="default">Add a Plan</LinkButton>} />
      </>
    );
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/renewals" className="text-muted-foreground hover:text-foreground">
          ← Renewals
        </Link>
      </p>
      <PageHeader title="New Package" subtitle="Client, websites, hosting plan and, if it renews with the hosting, the domain name." />

      <div className="max-w-2xl space-y-6">
        <form className="rounded-xl border bg-card p-5" method="get">
          <Field label="1. Client" htmlFor="client" hint="Not in the list? Add the client from Elorus first.">
            <div className="flex gap-2">
              <NativeSelect id="client" name="client" defaultValue={clientId} required>
                <option value="" disabled>
                  Choose a client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="outline">
                Continue
              </Button>
            </div>
          </Field>
          <Link href="/clients/new" className="mt-2 inline-block text-[13px] text-primary hover:underline">
            Add a client from Elorus
          </Link>
        </form>

        {client && (
          <div className="rounded-xl border bg-card p-5">
            {client.websites.length === 0 ? (
              <EmptyState
                title={`${client.name} has no websites yet`}
                body="Add the domains this package covers on the client page."
                action={<LinkButton href={`/clients/${client.id}`}>Add Websites</LinkButton>}
              />
            ) : (
              <NewPackageForm
                clientId={client.id}
                today={toDateInput(new Date())}
                sites={client.websites.map((w) => ({
                  id: w.id,
                  domain: w.domain,
                  covered: w.packages.some((p) => p.package.status !== "cancelled"),
                  hasDomain: Boolean(w.packageDomain),
                }))}
                hostingPlans={plans.map((p) => ({ id: p.id, name: p.name, periodMonths: p.periodMonths, label: `${p.name} · ${formatEur(p.priceNetCents, "en")} net / year` }))}
                domainPlans={domainPlans.map((p) => ({
                  id: p.id,
                  name: p.name,
                  periodMonths: p.periodMonths,
                  label: `${p.name} · ${formatEur(p.priceNetCents, "en")} / ${p.periodMonths === 24 ? "2 years" : "year"}`,
                }))}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
