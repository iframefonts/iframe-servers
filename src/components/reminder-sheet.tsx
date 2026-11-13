"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type ReminderPreview = { to: string[]; subject: string; body: string; button: string; language: string };

/** "Send Reminder" emails the client, so the email is previewed before it goes out. */
export function ReminderSheet({ preview, send, disabledReason }: { preview: ReminderPreview; send: () => Promise<ActionResult>; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={Boolean(disabledReason)} title={disabledReason}>
        <Mail aria-hidden /> Send Reminder
      </Button>
      <Sheet open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Send reminder now?</SheetTitle>
            <SheetDescription>This email goes to the client right away. Automatic reminders still go out on schedule.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 text-sm">
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">To</dt>
              <dd className="break-all">{preview.to.join(", ") || "No email address"}</dd>
              <dt className="text-muted-foreground">Language</dt>
              <dd>{preview.language}</dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="font-medium">{preview.subject}</dd>
            </dl>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="leading-relaxed">{preview.body}</p>
              <span className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground">{preview.button}</span>
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || preview.to.length === 0}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  const r = await send();
                  if (r.ok) {
                    toast.success(r.message);
                    setOpen(false);
                  } else toast.error(r.message);
                })
              }
            >
              {pending ? "Sending…" : "Send Reminder"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
