import { tz, TZDate } from "@date-fns/tz";
import { addMonths, differenceInCalendarDays, format, startOfDay } from "date-fns";

export const ATHENS = "Europe/Athens";
const inAthens = tz(ATHENS);

/** Calendar days from today (Athens) until the expiry day (Athens). 0 = expires today, negative = overdue. */
export function daysLeft(expiresAt: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(expiresAt, now, { in: inAthens });
}

/** Midnight in Athens of the given calendar date, as a UTC instant. */
export function athensDay(year: number, month1: number, day: number): Date {
  return new Date(new TZDate(year, month1 - 1, day, ATHENS).getTime());
}

/** Parse a "YYYY-MM-DD" form value as an Athens calendar day. */
export function parseAthensDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return athensDay(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function toDateInput(d: Date): string {
  return format(d, "yyyy-MM-dd", { in: inAthens });
}

/** Add a plan period, keeping the Athens calendar day. */
export function addPeriod(date: Date, months: number): Date {
  return new Date(addMonths(date, months, { in: inAthens }).getTime());
}

export function startOfAthensDay(d: Date): Date {
  return new Date(startOfDay(d, { in: inAthens }).getTime());
}

export function formatDate(d: Date, locale: "el" | "en" = "el"): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    timeZone: ATHENS,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatShortDate(d: Date, locale: "el" | "en" = "el"): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    timeZone: ATHENS,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "13 Nov, 15:27" this year; "10 Nov 2025, 09:00" otherwise. */
export function formatDateTime(d: Date, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ATHENS,
    day: "numeric",
    month: "short",
    year: athensYear(d) === athensYear(now) ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function athensYear(d: Date): number {
  return Number(format(d, "yyyy", { in: inAthens }));
}

/** "2026-11" for a date, in Athens time. */
export function athensMonthKey(d: Date): string {
  return format(d, "yyyy-MM", { in: inAthens });
}

/** Athens day of month (1–31). */
export function athensDayOfMonth(d: Date): number {
  return Number(format(d, "d", { in: inAthens }));
}

/** Month keys from a start key, e.g. monthRange("2026-11", 12) → ["2026-11", …, "2027-10"]. */
export function monthRange(startKey: string, count: number): string[] {
  const [y, m] = startKey.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const t = (m - 1 + i) % 12;
    const yy = y + Math.floor((m - 1 + i) / 12);
    return `${yy}-${String(t + 1).padStart(2, "0")}`;
  });
}

export function monthStart(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return athensDay(y, m, 1);
}

export function formatMonth(key: string, locale: "el" | "en" = "en"): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", { timeZone: ATHENS, month: "long", year: "numeric" }).format(
    new Date(monthStart(key).getTime() + 12 * 3600_000),
  );
}
