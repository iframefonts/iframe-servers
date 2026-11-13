import { AlertCircle, Check, Circle, Loader } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStep = {
  key: string;
  label: string;
  /** done = happened, failed = needs action, current = in progress, upcoming = expected */
  state: "done" | "failed" | "current" | "upcoming" | "skipped";
  when?: string;
  detail?: string;
};

const ICON = { done: Check, failed: AlertCircle, current: Loader, upcoming: Circle, skipped: Circle };

/**
 * The renewal timeline: one row that follows a renewal across reminders, Viva, and Elorus.
 * State is carried by icon + text, color only reinforces it.
 */
export function RenewalTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const Icon = ICON[s.state];
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn("absolute left-[11px] top-6 bottom-0 w-px", s.state === "done" ? "bg-success/40" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                s.state === "done" && "border-success/30 bg-success/10 text-success",
                s.state === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
                s.state === "current" && "border-info/30 bg-info/10 text-info",
                (s.state === "upcoming" || s.state === "skipped") && "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className={cn("size-3.5", s.state === "current" && "motion-safe:animate-spin")} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={cn("text-[15px]", s.state === "upcoming" || s.state === "skipped" ? "text-muted-foreground" : "font-medium")}>
                {s.label}
                <span className="sr-only"> ({s.state})</span>
              </p>
              {(s.when || s.detail) && (
                <p className={cn("text-[13px]", s.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {[s.when, s.detail].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
