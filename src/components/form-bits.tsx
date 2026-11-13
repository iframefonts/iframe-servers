"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** A form whose result shows inline next to the submit button and as a toast. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  resetOnSuccess,
}: {
  action: FormAction;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : submitLabel}
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

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Native select: accessible, keyboard-friendly, works with plain form posts. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
