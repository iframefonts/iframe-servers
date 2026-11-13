import { AlertCircle, Ban, Check, Circle, Clock, Loader, Mail, Pause, RotateCcw } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCalendar, type CalendarEntry, type CalendarMonth } from "@/lib/calendar";
import { athensMonthKey, athensYear, formatMonth } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import type { StatusIcon, Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

const ICONS: Record<StatusIcon, typeof Check> = { circle: Circle, clock: Clock, mail: Mail, check: Check, alert: AlertCircle, pause: Pause, x: Ban, loader: Loader, refund: RotateCcw };
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  progress: "text-info",
  done: "text-success",
  action: "text-destructive",
  muted: "text-muted-foreground",
};
const PREVIEW_ROWS = 8;
const e = (c: number) => formatEur(c, "en");

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const now = new Date();
  const thisMonth = athensMonthKey(now);
  const thisYear = athensYear(now);
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;
  const backQuery = year ? `?year=${year}` : "";

  if (month) {
    const [m] = await getCalendar(month, 1, { now });
    return <MonthDetail month={m} isCurrent={month === thisMonth} back={`/calendar${backQuery}`} />;
  }

  const months = year ? await getCalendar(`${year}-01`, 12, { now }) : await getCalendar(thisMonth, 12, { now });
  const total = months.reduce((s, m) => s + m.entries.length, 0);
  const due = months.reduce((s, m) => s + m.openCents, 0);

  const views = [
    { label: "Next 12 months", href: "/calendar", on: !year },
    ...[thisYear, thisYear + 1].map((y) => ({ label: String(y), href: `/calendar?year=${y}`, on: year === y })),
  ];

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`${total} renewal${total === 1 ? "" : "s"} · ${e(due)} still to collect, incl. VAT`}
        actions={
          <nav aria-label="Period" className="flex flex-wrap gap-1">
            {views.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                aria-current={v.on ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] font-medium num",
                  v.on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </Link>
            ))}
          </nav>
        }
      />

      <Legend />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {months.map((m) => (
          <MonthCard key={m.key} month={m} isCurrent={m.key === thisMonth} isPast={m.key < thisMonth} href={`/calendar?month=${m.key}${year ? `&year=${year}` : ""}`} />
        ))}
      </div>
    </>
  );
}

function MonthCard({ month, isCurrent, isPast, href }: { month: CalendarMonth; isCurrent: boolean; isPast: boolean; href: string }) {
  const n = month.entries.length;
  const shown = month.entries.slice(0, PREVIEW_ROWS);
  return (
    <section
      aria-labelledby={`m-${month.key}`}
      className={cn("flex flex-col rounded-xl border bg-card", isCurrent && "border-foreground/40 ring-1 ring-foreground/10", isPast && "opacity-80")}
    >
      <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`m-${month.key}`} className="text-[17px] font-semibold">
            <Link href={href} className="hover:underline">
              {formatMonth(month.key)}
            </Link>
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {n === 0 ? "No renewals" : `${n} renewal${n === 1 ? "" : "s"}`}
            {isCurrent && <span className="ml-1.5 font-medium text-foreground">· This month</span>}
          </p>
        </div>
        {n > 0 && (
          <div className="text-right">
            <p className="text-[15px] font-semibold num">{e(month.totalCents)}</p>
            {month.paidCents > 0 && <p className="text-[13px] text-success num">{e(month.paidCents)} paid</p>}
          </div>
        )}
      </header>
      {n > 0 && (
        <ul className="flex-1 divide-y">
          {shown.map((entry) => (
            <EntryRow key={entry.key} entry={entry} />
          ))}
        </ul>
      )}
      {n > PREVIEW_ROWS && (
        <Link href={href} className="border-t px-4 py-2.5 text-[13px] font-medium text-primary hover:underline">
          Show all {n}
        </Link>
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const Icon = ICONS[entry.status.icon];
  const showClient = entry.clientName !== entry.domains;
  return (
    <li className="relative flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
      <span className="w-6 shrink-0 text-right text-[13px] text-muted-foreground num" aria-label={`day ${entry.day}`}>
        {entry.day}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/renewals/${entry.packageId}`} className="block truncate text-[15px] after:absolute after:inset-0">
          {entry.domains}
        </Link>
        {showClient && <p className="truncate text-[13px] text-muted-foreground">{entry.clientName}</p>}
      </div>
      <span className={cn("flex shrink-0 items-center gap-1 text-[13px]", TONE_TEXT[entry.status.tone])} title={entry.status.label}>
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{entry.status.label}</span>
      </span>
    </li>
  );
}

function Legend() {
  const items: { icon: StatusIcon; tone: Tone; label: string }[] = [
    { icon: "check", tone: "done", label: "Paid" },
    { icon: "mail", tone: "progress", label: "Reminded" },
    { icon: "clock", tone: "neutral", label: "Upcoming" },
    { icon: "circle", tone: "neutral", label: "Active" },
    { icon: "alert", tone: "action", label: "Overdue" },
  ];
  return (
    <ul aria-label="Legend" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        return (
          <li key={i.label} className="flex items-center gap-1.5">
            <Icon className={cn("size-4", TONE_TEXT[i.tone])} aria-hidden />
            {i.label}
          </li>
        );
      })}
    </ul>
  );
}

function MonthDetail({ month, isCurrent, back }: { month: CalendarMonth; isCurrent: boolean; back: string }) {
  const n = month.entries.length;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={back} className="text-muted-foreground hover:text-foreground">
          ← Calendar
        </Link>
      </p>
      <PageHeader
        title={formatMonth(month.key)}
        subtitle={
          n === 0
            ? "No renewals this month."
            : `${n} renewal${n === 1 ? "" : "s"} · ${e(month.totalCents)} incl. VAT · ${e(month.paidCents)} paid · ${e(month.openCents)} to collect${isCurrent ? " · this month" : ""}`
        }
      />
      {n === 0 ? (
        <EmptyState title="Nothing renews this month" body="Pick another month from the calendar." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-right">Day</TableHead>
                <TableHead>Websites</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {month.entries.map((entry) => (
                <TableRow key={entry.key} className="relative">
                  <TableCell className="text-right text-muted-foreground num">{entry.day}</TableCell>
                  <TableCell className="max-w-[260px] font-medium">
                    <Link href={`/renewals/${entry.packageId}`} className="block truncate after:absolute after:inset-0">
                      {entry.domains}
                    </Link>
                    <span className="block truncate text-[13px] font-normal text-muted-foreground md:hidden">{entry.clientName}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-[240px] truncate md:table-cell">{entry.clientName}</TableCell>
                  <TableCell className="text-right num">{entry.amountCents ? e(entry.amountCents) : <span className="text-muted-foreground">No price</span>}</TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
