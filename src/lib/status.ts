import { daysLeft } from "@/lib/dates";
import { missingInvoiceDetails } from "@/lib/elorus/client";

/**
 * One status vocabulary, everywhere (see "Status vocabulary" in the plan).
 * Each status has a text label and an icon; color only reinforces the category.
 */
export type Tone = "neutral" | "progress" | "done" | "action" | "muted";
export type Status = { label: string; tone: Tone; icon: StatusIcon; detail?: string };
export type StatusIcon = "circle" | "clock" | "mail" | "check" | "alert" | "pause" | "x" | "loader" | "refund";

type PkgLike = {
  status: "active" | "expired" | "cancelled";
  expiresAt: Date;
  remindersEnabled: boolean;
  client: Parameters<typeof missingInvoiceDetails>[0];
  reminders?: { kind: string; status: string; periodEnd: Date }[];
  payments?: { status: string; paidAt: Date; invoice: { status: string; emailStatus: string } | null }[];
};

const KIND_LABEL: Record<string, string> = { d30: "Reminded 30d", d7: "Reminded 7d", d1: "Reminded 1d" };

/** The main status of a package, plus secondary flags. */
export function packageStatus(pkg: PkgLike, now = new Date()): { primary: Status; flags: Status[] } {
  const flags: Status[] = [];
  const d = daysLeft(pkg.expiresAt, now);

  const missing = missingInvoiceDetails(pkg.client);
  if (missing.length && pkg.status !== "cancelled") {
    flags.push({ label: "Missing tax details", tone: "action", icon: "alert", detail: missing.join(", ") });
  }
  if (!pkg.remindersEnabled && pkg.status === "active") flags.push({ label: "Reminders paused", tone: "muted", icon: "pause" });

  const latestPayment = [...(pkg.payments ?? [])].sort((a, b) => +b.paidAt - +a.paidAt);
  if (latestPayment.some((p) => p.status === "needs_refund")) flags.push({ label: "Needs refund", tone: "action", icon: "refund" });
  const lastRecorded = latestPayment.find((p) => p.status === "recorded");
  if (lastRecorded?.invoice) {
    const inv = lastRecorded.invoice;
    if (inv.status === "failed" || inv.emailStatus === "failed") flags.push({ label: "Invoice failed", tone: "action", icon: "alert" });
    else if (inv.status === "pending") flags.push({ label: "Invoicing…", tone: "progress", icon: "loader" });
  }

  if (pkg.status === "cancelled") return { primary: { label: "Cancelled", tone: "muted", icon: "x" }, flags };
  if (pkg.status === "expired" || d < 0) {
    return { primary: { label: "Overdue", tone: "action", icon: "alert", detail: `${-d} day${d === -1 ? "" : "s"}` }, flags };
  }
  const failedReminder = pkg.reminders?.find((r) => r.status === "failed" && +r.periodEnd === +pkg.expiresAt);
  if (failedReminder) flags.push({ label: "Reminder failed", tone: "action", icon: "alert" });

  if (d <= 30) {
    const sent = (pkg.reminders ?? [])
      .filter((r) => r.status === "sent" && +r.periodEnd === +pkg.expiresAt && r.kind in KIND_LABEL)
      .map((r) => r.kind);
    const latest = ["d1", "d7", "d30"].find((k) => sent.includes(k));
    if (latest) return { primary: { label: KIND_LABEL[latest], tone: "progress", icon: "mail" }, flags };
    return { primary: { label: "Upcoming", tone: "neutral", icon: "clock", detail: d === 0 ? "today" : `${d} days` }, flags };
  }
  // Paid recently for the new period
  if (lastRecorded && now.getTime() - lastRecorded.paidAt.getTime() < 45 * 86400_000) {
    return { primary: { label: "Paid", tone: "done", icon: "check" }, flags };
  }
  return { primary: { label: "Active", tone: "neutral", icon: "circle" }, flags };
}

export function daysLeftLabel(expiresAt: Date, now = new Date()) {
  const d = daysLeft(expiresAt, now);
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  if (d > 1) return `${d} days left`;
  return `${-d} day${d === -1 ? "" : "s"} overdue`;
}
