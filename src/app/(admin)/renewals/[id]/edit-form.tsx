"use client";

import { updatePackage } from "@/app/(admin)/actions";
import { ActionForm, Field } from "@/components/form-bits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toInput(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(d);
}

export function EditPackageForm({
  id,
  websites,
  values,
}: {
  id: string;
  websites: { id: string; domain: string }[];
  values: { expiresAt: Date; notes: string; websiteIds: string[] };
}) {
  return (
    <ActionForm action={updatePackage.bind(null, id)} submitLabel="Save Changes">
      <Field label="Expires on" htmlFor="expiresAt" hint="Change only to correct a mistake. Payments move it forward automatically.">
        <Input id="expiresAt" name="expiresAt" type="date" defaultValue={toInput(values.expiresAt)} required className="sm:max-w-[220px]" />
      </Field>
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
