"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { addPackageDomain, setPackagePlan, type ActionResult } from "@/app/(admin)/actions";
import { Field, NativeSelect } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type HostingPlan = { id: string; label: string };
type DomainPlan = { id: string; name: string; label: string; periodMonths: number };

/** Toast on success, inline message on error: feedback stays in place, never in an alert. */
function useToastAction(action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>, onOk?: () => void) {
  return useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) {
      toast.success(r.message);
      onOk?.();
    }
    return r;
  }, null);
}

/**
 * What the client pays for, in one place: the hosting plan (hosting plans only), then each domain
 * renewed with it. Adding a domain is disclosed on demand, with the plan picked from the TLD.
 */
export function HostingAndDomains({
  packageId,
  hostingPlans,
  current,
  domainPlans,
  freeSites,
  thisRenewal,
  nextRenewal,
  domainRows,
  missingHostingPlan,
}: {
  packageId: string;
  hostingPlans: HostingPlan[];
  current: { planId: string; customPrice: string };
  domainPlans: DomainPlan[];
  freeSites: { id: string; domain: string }[];
  thisRenewal: string;
  nextRenewal: string;
  domainRows: ReactNode;
  missingHostingPlan: boolean;
}) {
  const [planState, planAction, planPending] = useToastAction(setPackagePlan.bind(null, packageId));

  return (
    <div className="divide-y rounded-xl border bg-card">
      {/* Hosting */}
      {/* Keyed on the saved values: React resets a form after its action, so remount it with the new defaults. */}
      <form key={`${current.planId}:${current.customPrice}:${missingHostingPlan}`} action={planAction} className="p-5">
        <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Hosting</p>
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_180px_auto]">
          <Field label="Hosting plan" htmlFor="hostingPlan">
            <NativeSelect id="hostingPlan" name="planId" required defaultValue={missingHostingPlan ? "" : current.planId}>
              <option value="" disabled>
                Choose a hosting plan…
              </option>
              {hostingPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Custom net price (€)" htmlFor="hostingPrice">
            <Input id="hostingPrice" name="customPrice" inputMode="decimal" placeholder="Plan price" defaultValue={current.customPrice} />
          </Field>
          <Button type="submit" disabled={planPending} aria-busy={planPending}>
            {planPending ? "Saving…" : "Save Plan"}
          </Button>
        </div>
        {planState && !planState.ok && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {planState.message}
          </p>
        )}
      </form>

      {/* Domains */}
      <div>
        <p className="px-5 pt-5 pb-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Domains</p>
        {domainRows}
        <AddDomain
          packageId={packageId}
          domainPlans={domainPlans}
          freeSites={freeSites}
          thisRenewal={thisRenewal}
          nextRenewal={nextRenewal}
        />
      </div>
    </div>
  );
}

/** Picks the domain plan that matches the website's ending: example.gr → ".gr domain". */
function planForDomain(domain: string, plans: DomainPlan[]) {
  const tld = domain.slice(domain.lastIndexOf(".")).toLowerCase();
  return plans.find((p) => p.name.toLowerCase().startsWith(tld)) ?? plans[0];
}

function AddDomain({
  packageId,
  domainPlans,
  freeSites,
  thisRenewal,
  nextRenewal,
}: {
  packageId: string;
  domainPlans: DomainPlan[];
  freeSites: { id: string; domain: string }[];
  thisRenewal: string;
  nextRenewal: string;
}) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(freeSites[0]?.id ?? "");
  const site = freeSites.find((s) => s.id === siteId);
  const [planId, setPlanId] = useState(() => (freeSites[0] && domainPlans.length ? planForDomain(freeSites[0].domain, domainPlans).id : ""));
  const plan = domainPlans.find((p) => p.id === planId);
  const [state, action, pending] = useToastAction(addPackageDomain.bind(null, packageId), () => setOpen(false));

  if (domainPlans.length === 0) {
    return <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Add a domain plan on the Plans page first, for example “.gr domain”, 2 years.</p>;
  }
  if (freeSites.length === 0) {
    return <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Every website of this client already has its domain on a package.</p>;
  }
  if (!open) {
    return (
      <div className="px-5 pb-5 pt-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus aria-hidden /> Add Domain
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="mx-5 mb-5 mt-2 space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Domain" htmlFor="websiteId">
          <NativeSelect
            id="websiteId"
            name="websiteId"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              const s = freeSites.find((x) => x.id === e.target.value);
              if (s) setPlanId(planForDomain(s.domain, domainPlans).id);
            }}
          >
            {freeSites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.domain}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Domain plan" htmlFor="domainPlan" hint={site ? `Picked from the ending of ${site.domain}` : undefined}>
          <NativeSelect id="domainPlan" name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {domainPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {plan && plan.periodMonths > 12 ? (
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">Is {site?.domain} due on {thisRenewal}?</legend>
          <label className="flex min-h-9 items-center gap-2.5 text-sm">
            <input type="radio" name="firstRenewal" value="this" defaultChecked className="size-4 accent-primary" />
            Yes, add it to this renewal
          </label>
          <label className="flex min-h-9 items-center gap-2.5 text-sm">
            <input type="radio" name="firstRenewal" value="next" className="size-4 accent-primary" />
            No, it was paid last time. Next due {nextRenewal}
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="firstRenewal" value="this" />
      )}

      <Field label="Custom net price (€, optional)" htmlFor="domainPrice">
        <Input id="domainPrice" name="customPrice" inputMode="decimal" placeholder="Plan price" className="sm:max-w-[180px]" />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Adding…" : "Add Domain"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {state && !state.ok && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
