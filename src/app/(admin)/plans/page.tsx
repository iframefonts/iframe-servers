import { savePlan, setPlanActive } from "@/app/(admin)/actions";
import { ActionButton } from "@/components/action-button";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { PageHeader, Section } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { amountsFor, formatEur } from "@/lib/money";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  const plans = await db.plan.findMany({
    orderBy: [{ active: "desc" }, { priceNetCents: "asc" }],
    include: { _count: { select: { packages: { where: { status: { not: "cancelled" } } }, domains: true } } },
  });
  const groups = [
    { kind: "hosting" as const, title: "Hosting", description: "Yearly hosting tiers.", plans: plans.filter((p) => p.kind === "hosting") },
    { kind: "domain" as const, title: "Domain names", description: ".gr renews every 2 years, other endings yearly. Added to a package, a domain renews on the same invoice as the hosting.", plans: plans.filter((p) => p.kind === "domain") },
  ];

  return (
    <>
      <PageHeader title="Plans" subtitle="Hosting tiers. Prices are net; VAT is added per client." />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          {groups.map((g) => (
            <Section key={g.kind} title={g.title} description={g.description}>
              {g.plans.length === 0 ? (
                <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">
                  {g.kind === "domain" ? "No domain plans yet. Add one, e.g. “.gr domain” at 2 years." : "No hosting plans yet."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {g.plans.map((p) => (
                    <li key={p.id} className="rounded-xl border bg-card p-5">
                      <details>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="flex-1 text-[15px] font-semibold">
                            {p.name}
                            {!p.active && <span className="ml-2 text-[13px] font-normal text-muted-foreground">archived</span>}
                          </span>
                          <span className="text-sm num">
                            {formatEur(p.priceNetCents, "en")} net · {formatEur(amountsFor(p.priceNetCents, "domestic").amountCents, "en")} with 24% VAT
                          </span>
                          <span className="text-[13px] text-muted-foreground">
                            {p.periodMonths === 24 ? "every 2 years" : "yearly"} · {p.kind === "domain" ? `${p._count.domains + p._count.packages} domain${p._count.domains + p._count.packages === 1 ? "" : "s"}` : `${p._count.packages} package${p._count.packages === 1 ? "" : "s"}`}
                          </span>
                          <span className="text-[13px] text-primary">Edit</span>
                        </summary>
                        <div className="mt-4 border-t pt-4">
                          <PlanForm plan={p} />
                          <div className="mt-3">
                            <ActionButton
                              variant="ghost"
                              size="sm"
                              action={async () => {
                                "use server";
                                await setPlanActive(p.id, !p.active);
                                return { ok: true, message: p.active ? `${p.name} archived` : `${p.name} restored` };
                              }}
                            >
                              {p.active ? "Archive Plan" : "Restore Plan"}
                            </ActionButton>
                          </div>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ))}
        </div>
        <Section title="Add a plan">
          <div className="rounded-xl border bg-card p-5">
            <PlanForm />
          </div>
        </Section>
      </div>
    </>
  );
}

function PlanForm({ plan }: { plan?: { id: string; name: string; kind: "hosting" | "domain"; priceNetCents: number; periodMonths: number; elorusProductId: string | null } }) {
  const k = plan?.id ?? "new";
  return (
    <ActionForm action={savePlan} submitLabel={plan ? "Save Plan" : "Add Plan"} resetOnSuccess={!plan}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Name" htmlFor={`name-${k}`}>
          <Input id={`name-${k}`} name="name" required defaultValue={plan?.name} placeholder="e.g. Business or .gr domain" />
        </Field>
        <Field label="Type" htmlFor={`kind-${k}`}>
          <NativeSelect id={`kind-${k}`} name="kind" defaultValue={plan?.kind ?? "hosting"}>
            <option value="hosting">Hosting</option>
            <option value="domain">Domain name</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Net price (€)" htmlFor={`price-${k}`}>
          <Input id={`price-${k}`} name="price" required inputMode="decimal" defaultValue={plan ? (plan.priceNetCents / 100).toFixed(2) : ""} placeholder="120,00" />
        </Field>
        <Field label="Period" htmlFor={`period-${k}`}>
          <NativeSelect id={`period-${k}`} name="periodMonths" defaultValue={String(plan?.periodMonths ?? 12)}>
            <option value="12">1 year</option>
            <option value="24">2 years (.gr domains)</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Elorus product ID (optional)" htmlFor={`prod-${k}`} hint="Links the invoice line to your Elorus product (“Web hosting” or “Domain name”).">
        <Input id={`prod-${k}`} name="elorusProductId" defaultValue={plan?.elorusProductId ?? ""} />
      </Field>
    </ActionForm>
  );
}
