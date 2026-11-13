"use client";

import { useState } from "react";
import { createPackage } from "@/app/(admin)/actions";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Plan = { id: string; name: string; label: string; periodMonths: number };
type Site = { id: string; domain: string; covered: boolean; hasDomain: boolean };

const planForDomain = (domain: string, plans: Plan[]) => {
  const tld = domain.slice(domain.lastIndexOf(".")).toLowerCase();
  return plans.find((p) => p.name.toLowerCase().startsWith(tld)) ?? plans[0];
};

/** Hosting and the domain name are separate inputs: one hosting plan, an optional domain on its own plan. */
export function NewPackageForm({
  clientId,
  sites,
  hostingPlans,
  domainPlans,
  today,
}: {
  clientId: string;
  sites: Site[];
  hostingPlans: Plan[];
  domainPlans: Plan[];
  today: string;
}) {
  const domainSites = sites.filter((s) => !s.hasDomain);
  const [withDomain, setWithDomain] = useState(false);
  const [domainSiteId, setDomainSiteId] = useState(domainSites[0]?.id ?? "");
  const domainSite = domainSites.find((s) => s.id === domainSiteId);
  const [domainPlanId, setDomainPlanId] = useState(() =>
    domainSites[0] && domainPlans.length ? planForDomain(domainSites[0].domain, domainPlans).id : "",
  );
  const domainPlan = domainPlans.find((p) => p.id === domainPlanId);

  return (
    <ActionForm action={createPackage} submitLabel="Create Package">
      <input type="hidden" name="clientId" value={clientId} />

      <fieldset className="space-y-2">
        <legend className="text-[15px] font-semibold">2. Websites</legend>
        {sites.map((w) => (
          <label key={w.id} className="flex min-h-9 items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" name="websiteIds" value={w.id} defaultChecked={!w.covered} />
            {w.domain}
            {w.covered && <span className="text-[13px] text-muted-foreground">already on a package</span>}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-3 border-t pt-5">
        <legend className="text-[15px] font-semibold">3. Hosting</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Hosting plan" htmlFor="planId">
            <NativeSelect id="planId" name="planId" required defaultValue={hostingPlans[0]?.id}>
              {hostingPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Custom net price (€, optional)" htmlFor="customPrice">
            <Input id="customPrice" name="customPrice" inputMode="decimal" placeholder="Plan price" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t pt-5">
        <legend className="text-[15px] font-semibold">4. Domain name</legend>
        {domainPlans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a domain plan on the Plans page to renew domains with packages.</p>
        ) : domainSites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every website of this client already has its domain on a package.</p>
        ) : (
          <>
            <label className="flex min-h-9 items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="withDomain"
                className="size-4 accent-primary"
                checked={withDomain}
                onChange={(e) => setWithDomain(e.target.checked)}
              />
              Also renew a domain name with this package
            </label>
            {withDomain && (
              <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Domain" htmlFor="domainWebsiteId">
                    <NativeSelect
                      id="domainWebsiteId"
                      name="domainWebsiteId"
                      value={domainSiteId}
                      onChange={(e) => {
                        setDomainSiteId(e.target.value);
                        const s = domainSites.find((x) => x.id === e.target.value);
                        if (s) setDomainPlanId(planForDomain(s.domain, domainPlans).id);
                      }}
                    >
                      {domainSites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.domain}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Domain plan" htmlFor="domainPlanId" hint={domainSite ? `Picked from the ending of ${domainSite.domain}` : undefined}>
                    <NativeSelect id="domainPlanId" name="domainPlanId" value={domainPlanId} onChange={(e) => setDomainPlanId(e.target.value)}>
                      {domainPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
                {domainPlan && domainPlan.periodMonths > 12 ? (
                  <fieldset className="space-y-1.5">
                    <legend className="text-[13px] font-medium">Is {domainSite?.domain} due with the first renewal?</legend>
                    <label className="flex min-h-9 items-center gap-2.5 text-sm">
                      <input type="radio" name="domainFirstRenewal" value="this" defaultChecked className="size-4 accent-primary" />
                      Yes, renew it with the first renewal
                    </label>
                    <label className="flex min-h-9 items-center gap-2.5 text-sm">
                      <input type="radio" name="domainFirstRenewal" value="next" className="size-4 accent-primary" />
                      No, it was paid last time. Renew it with the second renewal
                    </label>
                  </fieldset>
                ) : (
                  <input type="hidden" name="domainFirstRenewal" value="this" />
                )}
                <Field label="Custom net price (€, optional)" htmlFor="domainPrice">
                  <Input id="domainPrice" name="domainCustomPrice" inputMode="decimal" placeholder="Plan price" className="sm:max-w-[200px]" />
                </Field>
              </div>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="space-y-3 border-t pt-5">
        <legend className="text-[15px] font-semibold">5. Dates</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startDate">
            <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
          </Field>
          <Field label="Next renewal date (optional)" htmlFor="expiresAt" hint="For hosting you already run. Empty: start date + 1 year.">
            <Input id="expiresAt" name="expiresAt" type="date" />
          </Field>
        </div>
      </fieldset>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
    </ActionForm>
  );
}
