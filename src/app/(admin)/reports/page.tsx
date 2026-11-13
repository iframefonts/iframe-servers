import Link from "next/link";
import { HBars, StackedBars } from "@/components/charts";
import { PageHeader, Section } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { athensYear } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { getReports } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split("-").map(Number);
  return long ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
};
const e = (c: number) => formatEur(c, "en");
const money3 = (x: { net: number; vat: number; gross: number }) => `${e(x.net)} net · ${e(x.vat)} VAT · ${e(x.gross)}`;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const current = athensYear(new Date());
  const year = Number(sp.year) || current;
  const r = await getReports(year);

  const best = [...r.byMonth].sort((a, b) => b.net - a.net)[0];
  const change = r.income.lastYear.net ? Math.round(((r.income.thisYear.net - r.income.lastYear.net) / r.income.lastYear.net) * 100) : null;
  const incomeSummary =
    r.income.thisYear.net === 0
      ? `No income recorded in ${year} yet.`
      : `${e(r.income.thisYear.net)} net in ${year}${change !== null ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on ${year - 1}` : ""}. Best month: ${monthLabel(best.month, true)} (${e(best.net)} net).`;
  const busiest = [...r.calendar].sort((a, b) => b.net - a.net)[0];
  const calendarSummary = busiest?.net
    ? `${e(r.calendar.reduce((s, c) => s + c.net, 0))} net due over the next 12 months. Busiest: ${monthLabel(busiest.month, true)} (${busiest.count} renewals, ${e(busiest.net)}).`
    : "No renewals due in the next 12 months.";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Today
        </Link>
      </p>
      <PageHeader
        title="Reports"
        subtitle="How big hosting is and what money is coming in. Income includes Viva and bank transfers."
        actions={
          <nav aria-label="Year" className="flex gap-1">
            {[current - 2, current - 1, current].map((y) => (
              <Link
                key={y}
                href={`/reports?year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 text-[13px] font-medium num", y === year ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {y}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={`${r.clients.active}`} sub={`active of ${r.clients.total} (${r.clients.linked} linked to Elorus)`} />
        <Stat label="Websites" value={`${r.websites.total}`} sub={`${r.websites.active} on an active package`} />
        <Stat label="Packages" value={`${r.packages.active}`} sub={`${r.packages.expiring30} expiring in 30 days · ${r.packages.overdue} overdue`} />
        <Stat label="Recurring revenue" value={e(r.arrNetCents)} sub="per year, net, active packages" />
        <Stat label={`Income ${year}`} value={e(r.income.thisYear.gross)} sub={`${e(r.income.thisYear.net)} net + ${e(r.income.thisYear.vat)} VAT`} />
        <Stat label="Expected renewals" value={e(r.expected.d30)} sub={`next 30 days · ${e(r.expected.d90)} in 90 days (net)`} />
        <Stat label="Overdue" value={e(r.overdue.net)} sub={`${r.overdue.count} expired, unpaid (net)`} alert={r.overdue.count > 0} />
        <Stat label="Averages" value={e(r.averages.perClient)} sub={`net per client · ${e(r.averages.perSite)} per website`} />
      </div>

      <Section title="Income">
        <dl className="mb-4 grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
          {(
            [
              ["This month", r.income.thisMonth],
              [`${year}`, r.income.thisYear],
              [`${year - 1}`, r.income.lastYear],
              ["All time", r.income.allTime],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="num">{money3(v)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <ChartCard title={`Income per month, ${year}`} summary={incomeSummary}>
        <StackedBars series={["Net", "VAT"]} data={r.byMonth.map((m) => ({ label: monthLabel(m.month, true), short: monthLabel(m.month), values: [m.net, m.vat] }))} />
        <DataTable
          head={["Month", "Net", "VAT", "Total"]}
          rows={r.byMonth.map((m) => [monthLabel(m.month, true), e(m.net), e(m.vat), e(m.gross)])}
        />
      </ChartCard>

      <ChartCard title="Renewals calendar" summary={calendarSummary}>
        <StackedBars series={["Due (net)"]} height={200} data={r.calendar.map((c) => ({ label: `${monthLabel(c.month, true)} · ${c.count} renewals`, short: monthLabel(c.month), values: [c.net] }))} />
        <DataTable head={["Month", "Renewals", "Due (net)"]} rows={r.calendar.map((c) => [monthLabel(c.month, true), String(c.count), e(c.net)])} />
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={`Income by plan, ${year}`} summary={r.byPlan.length ? `${r.byPlan[0].plan} brings the most: ${e(r.byPlan[0].net)} net.` : "No income by plan yet."}>
          {r.byPlan.length > 0 && <HBars data={r.byPlan.map((p) => ({ label: p.plan, value: p.net }))} />}
          <DataTable head={["Plan", "Net"]} rows={r.byPlan.map((p) => [p.plan, e(p.net)])} />
        </ChartCard>
      </div>

      <Section title={`Top clients, ${year}`} description="By net income.">
        {r.topClients.length === 0 ? (
          <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">No payments in {year} yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.topClients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="hover:underline">
                        {c.client}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right num">{c.count}</TableCell>
                    <TableCell className="text-right num">{e(c.net)}</TableCell>
                    <TableCell className="text-right num">{e(c.gross)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold num", alert && "text-destructive")}>{value}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function ChartCard({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border bg-card p-5">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{summary}</p>
      {children}
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
          {rows.map((r) => (
            <tr key={r[0]} className="border-b last:border-0">
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
