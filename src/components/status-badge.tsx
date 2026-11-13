import { AlertCircle, Ban, Check, Circle, Clock, Loader, Mail, Pause, RotateCcw } from "lucide-react";
import type { Status, StatusIcon, Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const ICONS: Record<StatusIcon, typeof Check> = {
  circle: Circle,
  clock: Clock,
  mail: Mail,
  check: Check,
  alert: AlertCircle,
  pause: Pause,
  x: Ban,
  loader: Loader,
  refund: RotateCcw,
};

/** Red is reserved for "needs action" and used for nothing else. */
const TONES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground border-border",
  progress: "bg-info/10 text-info border-info/25",
  done: "bg-success/10 text-success border-success/25",
  action: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-transparent text-muted-foreground border-border",
};

/** `compact` hides the inline detail (kept as a tooltip) for dense tables. */
export function StatusBadge({ status, className, compact }: { status: Status; className?: string; compact?: boolean }) {
  const Icon = ICONS[status.icon];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-medium",
        TONES[status.tone],
        className,
      )}
      title={status.detail}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {status.label}
      {status.detail && !compact && <span className="font-normal opacity-80">· {status.detail}</span>}
    </span>
  );
}
