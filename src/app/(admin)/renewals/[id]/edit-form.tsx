"use client";

import { updatePackage } from "@/app/(admin)/actions";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toInput(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(d);
}

export function EditPackageForm({
  id,
  plans,
  websites,
  values,
}: {
  id: string;
  plans: { id: string; label: string }[];
  websites: { id: string; domain: string }[];
  values: { planId: string; expiresAt: Date; customPriceNetCents: number | null; notes: string; websiteIds: string[] };
}) {
  return (
    <ActionForm action={updatePackage.bind(null, id)} submitLabel="Save Changes">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="planId">
          <NativeSelect id="planId" name="planId" defaultValue={values.planId}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Expires on" htmlFor="expiresAt" hint="Change only to correct a mistake. Payments move it forward automatically.">
          <Input id="expiresAt" name="expiresAt" type="date" defaultValue={toInput(values.expiresAt)} required />
        </Field>
        <Field label="Custom net price (€)" htmlFor="customPrice" hint="Leave empty to use the plan price. Open pay links update.">
          <Input
            id="customPrice"
            name="customPrice"
            inputMode="decimal"
            placeholder="Plan price"
            defaultValue={values.customPriceNetCents != null ? (values.customPriceNetCents / 100).toFixed(2) : ""}
          />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Websites</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {websites.map((w) => (
            <label key={w.id} className="flex min-h-9 items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-primary" name="websiteIds" value={w.id} defaultChecked={values.websiteIds.includes(w.id)} />
              {w.domain}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={values.notes} rows={2} />
      </Field>
    </ActionForm>
  );
}
