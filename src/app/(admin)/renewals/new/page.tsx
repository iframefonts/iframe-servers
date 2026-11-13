import Link from "next/link";
import { createPackage } from "@/app/(admin)/actions";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { LinkButton } from "@/components/link-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { formatEur } from "@/lib/money";

export const metadata = { title: "New Package" };

export default async function NewPackagePage({ searchParams }: PageProps<"/renewals/new">) {
  const sp = await searchParams;
  const clientId = typeof sp.client === "string" ? sp.client : "";
  const [clients, plans] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.plan.findMany({ where: { active: true, kind: "hosting", priceNetCents: { gt: 0 } }, orderBy: { priceNetCents: "asc" } }),
  ]);
  const client = clientId
    ? await db.client.findUnique({ where: { id: clientId }, include: { websites: { include: { packages: { include: { package: true } } } } } })
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
      <PageHeader title="New Package" subtitle="Client, websites, plan and start date. The expiry is calculated from the plan period." />

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
              <ActionForm action={createPackage} submitLabel="Create Package">
                <input type="hidden" name="clientId" value={client.id} />
                <fieldset className="space-y-2">
                  <legend className="text-[13px] font-medium">2. Websites</legend>
                  {client.websites.map((w) => {
                    const covered = w.packages.find((p) => p.package.status !== "cancelled");
                    return (
                      <label key={w.id} className="flex min-h-9 items-center gap-2.5 text-sm">
                        <input type="checkbox" className="size-4 accent-primary" name="websiteIds" value={w.id} defaultChecked={!covered} />
                        {w.domain}
                        {covered && <span className="text-[13px] text-muted-foreground">already on a package</span>}
                      </label>
                    );
                  })}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="3. Hosting plan" htmlFor="planId" hint="Domains are added on the package page after it’s created.">
                    <NativeSelect id="planId" name="planId" required defaultValue={plans[0].id}>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {formatEur(p.priceNetCents, "en")} net / year
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="4. Start date" htmlFor="startDate">
                    <Input id="startDate" name="startDate" type="date" required defaultValue={toDateInput(new Date())} />
                  </Field>
                  <Field label="Expiry (optional)" htmlFor="expiresAt" hint="For existing hosting: the next renewal date. Otherwise start + plan period.">
                    <Input id="expiresAt" name="expiresAt" type="date" />
                  </Field>
                  <Field label="Custom net price (€, optional)" htmlFor="customPrice" hint="Leave empty to use the plan price.">
                    <Input id="customPrice" name="customPrice" inputMode="decimal" placeholder="Plan price" />
                  </Field>
                </div>
                <Field label="Notes" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={2} />
                </Field>
              </ActionForm>
            )}
          </div>
        )}
      </div>
    </>
  );
}
