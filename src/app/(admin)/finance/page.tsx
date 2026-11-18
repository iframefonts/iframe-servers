import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import { syncFinanceNow } from "@/app/(admin)/actions";
import { ActionButton } from "@/components/action-button";
import { HBars, StackedBars } from "@/components/charts";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { athensMonthKey, athensYear, formatDateTime } from "@/lib/dates";
import { mock } from "@/lib/env";
import { getFinance, type Money } from "@/lib/finance/queries";
import { FINANCE_DAILY_REQUESTS } from "@/lib/finance/sync";
import { formatEur } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Finance" };
/** "Sync Now" reads Elorus for up to 4 minutes. */
export const maxDuration = 300;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const e = (c: number) => formatEur(c, "en");
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const sp = await searchParams;
  const today = new Date();
  const currentYear = athensYear(today);
  const year = Number(sp.year) || currentYear;
  const monthParam = Number(sp.month);
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : null;
  const f = await getFinance({ year, month });

  const period = month ? `${LONG_MONTHS[month - 1]} ${year}` : `${year}`;
  const prevPeriod = month ? `${LONG_MONTHS[month - 1]} ${year - 1}` : `${year - 1}`;
  // The current year/month isn't over: say so, so the comparison isn't misread.
  const partial = year === currentYear && (!month || athensMonthKey(today) === `${year}-${String(month).padStart(2, "0")}`);
  const href = (y: number, m: number | null) => `/finance?year=${y}${m ? `&month=${m}` : ""}`;
  const years = [...new Set([...f.years, currentYear])].sort((a, b) => a - b);

  const syncButton = (
    <ActionButton action={syncFinanceNow} pendingLabel="Reading Elorus…">
      Sync Now
    </ActionButton>
  );

  if (f.documents === 0) {
    return (
      <>
        <PageHeader title="Finance" subtitle="Income and outgoings from Elorus." />
        <EmptyState
          title={mock.elorus ? "Elorus is in test mode" : "No Elorus data yet"}
          body={
            mock.elorus
              ? "Add ELORUS_TOKEN and ELORUS_ORG_ID to read your invoices, bills and expenses."
              : "Sync copies every invoice, credit note, bill and expense from Elorus. It only reads; nothing changes in Elorus. Totals appear right away; categories fill in over the next nights."
          }
          action={mock.elorus ? undefined : syncButton}
        />
      </>
    );
  }

  const seriesData = f.series.map((s) => ({
    label: month ? `${s.key} ${MONTHS[month - 1]} ${year}` : `${LONG_MONTHS[Number(s.key) - 1]} ${year}`,
    short: month ? (Number(s.key) % 5 === 1 ? s.key : "") : MONTHS[Number(s.key) - 1],
    values: [s.income.net, s.out.net],
  }));
  const bestBar = [...f.series].sort((a, b) => b.income.net - a.income.net)[0];
  const seriesSummary =
    f.now.income.net === 0 && f.now.out.net === 0
      ? `Nothing invoiced or spent in ${period}.`
      : `${e(f.now.income.net)} income and ${e(f.now.out.net)} outgoings in ${period}.` +
        (bestBar?.income.net > 0 ? ` Best ${month ? "day" : "month"}: ${month ? `${bestBar.key} ${MONTHS[month - 1]}` : LONG_MONTHS[Number(bestBar.key) - 1]} (${e(bestBar.income.net)}).` : "");

  const bestYear = [...f.byYear].sort((a, b) => b.income - a.income)[0];
  const topCat = f.byCategory[0];
  const topType = f.byType[0];
  const top3 = f.topClients.slice(0, 3).reduce((s, c) => s + c.net, 0);

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle={
          <>
            Income and outgoings from Elorus, net of VAT. Synced nightly
            {f.lastSync ? `, last ${formatDateTime(f.lastSync, today)}` : ""}.
          </>
        }
        actions={syncButton}
      />

      {f.pending > 0 && (
        <p role="status" className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm">
          <span className="font-medium">{f.pending} documents still to read from Elorus.</span>{" "}
          <span className="text-muted-foreground">
            Totals, clients and types are complete. Categories fill in as invoices are read in full, about 80 a night: Finance uses at most {FINANCE_DAILY_REQUESTS} Elorus requests a day so invoicing always has enough.
          </span>
        </p>
      )}

      <div className="mb-6 space-y-2">
        <nav aria-label="Year" className="flex gap-1 overflow-x-auto pb-1">
          {years.map((y) => (
            <Pill key={y} href={href(y, month)} active={y === year}>
              {y}
            </Pill>
          ))}
        </nav>
        <nav aria-label="Month" className="flex gap-1 overflow-x-auto pb-1">
          <Pill href={href(year, null)} active={!month}>
            Whole year
          </Pill>
          {MONTHS.map((m, i) => (
            <Pill key={m} href={href(year, i + 1)} active={month === i + 1}>
              {m}
            </Pill>
          ))}
        </nav>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile label={`Income, ${period}`} money={f.now.income} prev={f.prev.income.net} prevPeriod={prevPeriod} noun="invoice" />
        <Tile label={`Outgoings, ${period}`} money={f.now.out} prev={f.prev.out.net} prevPeriod={prevPeriod} noun="bill" />
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[13px] font-medium text-muted-foreground">Result, {period}</p>
          <p className="mt-1 text-2xl font-semibold num">{e(f.now.result)}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Income minus outgoings, net</p>
          <Delta now={f.now.result} prev={f.prev.result} prevPeriod={prevPeriod} />
        </div>
      </div>
      {partial && <p className="-mt-3 mb-6 text-[13px] text-muted-foreground">{period} isn&apos;t over yet; the comparison is with the whole of {prevPeriod}.</p>}

      <ChartCard title={month ? `Income and outgoings per day, ${period}` : `Income and outgoings per month, ${year}`} summary={seriesSummary}>
        <StackedBars grouped series={["Income", "Outgoings"]} data={seriesData} label={`Income and outgoings per ${month ? "day" : "month"}, ${period}`} />
        <DataTable
          head={[month ? "Day" : "Month", "Income", "Outgoings", "Result"]}
          rows={f.series.filter((s) => !month || s.income.count + s.out.count > 0).map((s, i) => [month ? `${s.key} ${MONTHS[month - 1]}` : LONG_MONTHS[i], e(s.income.net), e(s.out.net), e(s.result)])}
        />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Income by category, ${period}`}
          summary={topCat ? `${topCat.name} brings the most: ${e(topCat.net)}${f.now.income.net > 0 ? ` (${pct(topCat.net / f.now.income.net)})` : ""}.` : `No income in ${period}.`}
          footer={
            <Link href="/settings#categories" className="text-[13px] text-primary hover:underline">
              Edit category rules
            </Link>
          }
        >
          {f.byCategory.length > 0 && <HBars data={f.byCategory.map((c) => ({ label: c.name, value: c.net }))} />}
          <DataTable head={["Category", "Net", "Share"]} rows={f.byCategory.map((c) => [c.name, e(c.net), f.now.income.net ? pct(c.net / f.now.income.net) : "–"])} />
        </ChartCard>

        <ChartCard title={`Income by document type, ${period}`} summary={topType ? `Mostly ${topType.name}: ${topType.count} documents, ${e(topType.net)}.` : `No income in ${period}.`}>
          {f.byType.length > 0 && <HBars data={f.byType.map((t) => ({ label: t.name, value: t.net }))} />}
          <DataTable head={["Type", "Documents", "Net"]} rows={f.byType.map((t) => [t.name, String(t.count), e(t.net)])} />
        </ChartCard>
      </div>

      <ChartCard
        title="Income and outgoings per year"
        summary={bestYear ? `Best year: ${bestYear.year} with ${e(bestYear.income)} income. All years since ${f.byYear[0].year}; this year so far: ${e(f.byYear.find((y) => y.year === currentYear)?.income ?? 0)}.` : "No years yet."}
      >
        <StackedBars grouped series={["Income", "Outgoings"]} data={f.byYear.map((y) => ({ label: String(y.year), short: String(y.year), values: [y.income, y.out] }))} label="Income and outgoings per year" />
        <DataTable head={["Year", "Income", "Outgoings", "Result"]} rows={f.byYear.map((y) => [String(y.year), e(y.income), e(y.out), e(y.income - y.out)])} />
      </ChartCard>

      <Section
        title={`Best clients, ${period}`}
        description={
          f.topClients.length
            ? `${f.clientCount} clients invoiced. The top 3 bring ${f.now.income.net ? pct(top3 / f.now.income.net) : "–"} of income.`
            : undefined
        }
      >
        {f.topClients.length === 0 ? (
          <EmptyState title={`No income in ${period}`} body="Pick another year or month above." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.topClients.map((c, i) => (
                  <TableRow key={c.key}>
                    <TableCell className="text-right text-muted-foreground num">{i + 1}</TableCell>
                    <TableCell className="max-w-[320px] truncate">
                      {c.clientId ? (
                        <Link href={`/clients/${c.clientId}`} className="hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                    </TableCell>
                    <TableCell className="text-right num">{c.count}</TableCell>
                    <TableCell className="text-right num">{pct(c.share)}</TableCell>
                    <TableCell className="text-right num">{e(c.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title={`Outgoings, ${period}`} description="Supplier bills and expenses recorded in Elorus.">
        {f.now.out.count === 0 ? (
          <EmptyState
            title={`No outgoings in ${period}`}
            body="Outgoings appear here once supplier bills or expenses are recorded in Elorus (Purchases → Bills / Expenses). The next sync picks them up."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="By supplier" summary={`${f.outBySupplier[0].name} is the largest: ${e(f.outBySupplier[0].net)} over ${f.outBySupplier[0].count} documents.`}>
              <HBars data={f.outBySupplier.slice(0, 10).map((s) => ({ label: s.name, value: s.net }))} />
              <DataTable head={["Supplier", "Documents", "Net"]} rows={f.outBySupplier.map((s) => [s.name, String(s.count), e(s.net)])} />
            </ChartCard>
            <ChartCard
              title="By type and category"
              summary={f.outByType.map((t) => `${t.count} ${t.name.toLowerCase()}${t.count === 1 ? "" : "s"} (${e(t.net)})`).join(", ") + "."}
            >
              {f.outByCategory.length > 0 && <HBars data={f.outByCategory.map((c) => ({ label: c.name, value: c.net }))} />}
              <DataTable head={["Category", "Net"]} rows={f.outByCategory.map((c) => [c.name, e(c.net)])} />
            </ChartCard>
          </div>
        )}
      </Section>
    </>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium num",
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Tile({ label, money, prev, prevPeriod, noun }: { label: string; money: Money; prev: number; prevPeriod: string; noun: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold num">{e(money.net)}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground num">
        {e(money.vat)} VAT · {e(money.gross)} gross · {money.count} {noun}
        {money.count === 1 ? "" : "s"}
      </p>
      <Delta now={money.net} prev={prev} prevPeriod={prevPeriod} />
    </div>
  );
}

/** Change vs the same period a year earlier: arrow + words, never color alone. */
function Delta({ now, prev, prevPeriod }: { now: number; prev: number; prevPeriod: string }) {
  if (!prev) return <p className="mt-2 text-[13px] text-muted-foreground">Nothing in {prevPeriod} to compare</p>;
  const change = Math.round(((now - prev) / Math.abs(prev)) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <p className="mt-2 flex items-center gap-1 text-[13px] text-muted-foreground num">
      <Icon className="size-3.5" aria-hidden />
      {change === 0 ? "Same as" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on`} {prevPeriod} ({e(prev)})
    </p>
  );
}

function ChartCard({ title, summary, children, footer }: { title: string; summary: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border bg-card p-5">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{summary}</p>
      {children}
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[13px] font-medium text-primary">View as table</summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn("py-1.5 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={`${r[0]}-${k}`} className="border-b last:border-0">
              {r.map((c, i) => (
                <td key={i} className={cn("py-1.5", i > 0 && "text-right num")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
