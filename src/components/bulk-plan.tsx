"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { bulkSetPlan, type ActionResult } from "@/app/(admin)/actions";
import { NativeSelect } from "@/components/form-bits";
import { Button } from "@/components/ui/button";

type PlanOption = { id: string; label: string; kind: "hosting" | "domain" };

const countChecked = (form: HTMLFormElement | null) => form?.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length ?? 0;

/**
 * Wraps the Renewals table: rows carry `<input name="ids">` checkboxes; when any are checked,
 * a bar slides in to set one plan on all of them. Changing a plan is undoable, so no confirm.
 */
export function BulkPlanForm({ plans, children }: { plans: PlanOption[]; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);
  const [, action, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const res = await bulkSetPlan(prev, fd);
    if (res.ok) {
      toast.success(res.message);
      ref.current?.reset();
      setCount(0);
    } else toast.error(res.message);
    return res;
  }, null);

  return (
    <form ref={ref} action={action} onChange={() => setCount(countChecked(ref.current))}>
      {children}
      {count > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-4 z-20 mx-auto mt-4 flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-3 shadow-lg"
        >
          <p className="text-[15px] font-medium num" aria-live="polite">
            {count} selected
          </p>
          <label htmlFor="bulk-plan" className="sr-only">
            Plan for the selected packages
          </label>
          <NativeSelect id="bulk-plan" name="planId" required defaultValue="" className="w-auto min-w-56 flex-1">
            <option value="" disabled>
              Choose a hosting plan…
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Set Hosting Plan"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              ref.current?.reset();
              setCount(0);
            }}
          >
            Clear
          </Button>
        </div>
      )}
    </form>
  );
}

/** Header checkbox: selects or clears every row checkbox in the surrounding form. */
export function SelectAllBox() {
  return (
    <input
      type="checkbox"
      aria-label="Select all packages on this page"
      className="relative z-10 size-4 accent-primary"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((i) => (i.checked = e.currentTarget.checked));
      }}
    />
  );
}
