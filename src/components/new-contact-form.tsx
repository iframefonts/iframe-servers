"use client";

import { createElorusContact } from "@/app/(admin)/actions";
import { ActionForm, Field, NativeSelect } from "@/components/form-bits";
import { Input } from "@/components/ui/input";

/** For clients not yet in Elorus: creates the contact in Elorus first, then links it. */
export function NewContactForm({ existingClientId, defaults }: { existingClientId?: string; defaults?: { name?: string; email?: string } }) {
  return (
    <ActionForm action={createElorusContact} submitLabel="Create in Elorus and Add">
      {existingClientId && <input type="hidden" name="existingClientId" value={existingClientId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name or company" htmlFor="name">
          <Input id="name" name="name" required defaultValue={defaults?.name} autoComplete="organization" />
        </Field>
        <Field label="Type" htmlFor="isCompany" hint="Business → ΤΠΥ invoice. Individual → ΑΠΥ receipt. Set the ΔΟΥ in Elorus if needed.">
          <NativeSelect id="isCompany" name="isCompany" defaultValue="yes">
            <option value="yes">Business</option>
            <option value="no">Individual</option>
          </NativeSelect>
        </Field>
        <Field label="ΑΦΜ / VAT number" htmlFor="vatNumber">
          <Input id="vatNumber" name="vatNumber" inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Address" htmlFor="address">
          <Input id="address" name="address" autoComplete="street-address" />
        </Field>
        <Field label="Billing email" htmlFor="email">
          <Input id="email" name="email" type="email" required defaultValue={defaults?.email} autoComplete="email" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        </Field>
      </div>
    </ActionForm>
  );
}
