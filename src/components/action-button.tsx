"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/app/(admin)/actions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Confirm = {
  title: string;
  body: ReactNode;
  /** Name the consequence: "Issue Invoice", not "OK". */
  confirmLabel: string;
  destructive?: boolean;
};

/**
 * Runs a server action and reports the result in place (toast), never in an alert.
 * Irreversible actions pass `confirm`, which names the exact consequence (HIG: warn before
 * unexpected, irreversible loss). Undoable actions don't confirm.
 */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "outline",
  size = "default",
  className,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: Confirm;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg";
  className?: string;
  pendingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () =>
    start(async () => {
      const res = await action();
      setOpen(false);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        aria-busy={pending}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending && !confirm ? (pendingLabel ?? "Working…") : children}
      </Button>
      {confirm && (
        <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription render={<div />}>{confirm.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant={confirm.destructive ? "destructive" : "default"} onClick={run} disabled={pending} aria-busy={pending}>
                {pending ? (pendingLabel ?? "Working…") : confirm.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
