import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { BulkPlanForm, SelectAllBox } from "@/components/bulk-plan";
import { LinkButton } from "@/components/link-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { daysLeft, formatShortDate } from "@/lib/dates";
import { amountsFor, formatEur } from "@/lib/money";
import { domainsOf, packageInclude } from "@/lib/queries";
import { linesNet, renewalLines } from "@/lib/renewal";
import { daysLeftLabel, packageStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Renewals" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "expiring7", label: "Within 7 days" },
  { key: "expiring30", label: "Within 30 days" },
  { key: "overdue", label: "Overdue" },
  { key: "paused", label: "Reminders paused" },
  { key: "setup", label: "Needs setup" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function RenewalsPage({ searchParams }: PageProps<"/renewals">) {
  const sp = await searchParams;
  const filter = (typeof sp.filter === "string" ? sp.filter : "all") as (typeof FILTERS)[number]["key"];
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const now = new Date();

  const all = await db.hostingPackage.findMany({
    where: {
      status: filter === "cancelled" ? "cancelled" : filter === "overdue" ? "expired" : { not: "cancelled" },
      ...(filter === "paused" ? { remindersEnabled: false } : {}),
      ...(filter === "setup"
        ? { AND: [{ OR: [{ client: { elorusContactId: null } }, { AND: [{ customPriceNetCents: null }, { plan: { priceNetCents: 0 } }] }] }] }
        : {}),
      ...(q
        ? {
            OR: [
              { client: { name: { contains: q, mode: "insensitive" } } },
              { websites: { some: { website: { domain: { contains: q, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    include: packageInclude,
    orderBy: { expiresAt: "asc" },
  });
  const pkgs = all.filter((p) => {
    const d = daysLeft(p.expiresAt, now);
    if (filter === "expiring7") return p.status === "active" && d <= 7;
    if (filter === "expiring30") return p.status === "active" && d <= 30;
    return true;
  });

  const plans = await db.plan.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { priceNetCents: "asc" }] });
  const planOptions = plans.map((pl) => ({
    id: pl.id,
    kind: pl.kind,
    label: `${pl.name} · ${formatEur(pl.priceNetCents, "en")} net / ${pl.periodMonths === 24 ? "2 years" : "year"}`,
  }));

  const href = (f: string) => `/renewals?${new URLSearchParams({ ...(f !== "all" ? { filter: f } : {}), ...(q ? { q } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Renewals"
        subtitle="Every hosting package, soonest expiry first."
        actions={
          <LinkButton href="/renewals/new" variant="default">
            <Plus aria-hidden /> New Package
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium",
                filter === f.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="relative w-full lg:w-72" role="search">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search domain or client" aria-label="Search renewals by domain or client" className="pl-8" />
        </form>
      </div>

      {pkgs.length === 0 ? (
        <EmptyState
          title={q ? `No packages match “${q}”` : filter === "all" ? "No hosting packages yet" : "Nothing here"}
          body={filter === "all" && !q ? "Add a client from Elorus, then create their first package." : "Try another filter."}
          action={filter === "all" && !q ? <LinkButton href="/renewals/new" variant="default">New Package</LinkButton> : undefined}
        />
      ) : (
        <BulkPlanForm plans={planOptions}>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <SelectAllBox />
                </TableHead>
                <TableHead>Websites</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="hidden lg:table-cell">Plan</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pkgs.map((p) => {
                const st = packageStatus(p, now);
                const lines = renewalLines(p);
                const amount = amountsFor(linesNet(lines), p.client.vatRegime).amountCents;
                return (
                  <TableRow key={p.id} className="relative">
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        aria-label={`Select ${domainsOf(p)}`}
                        className="relative z-10 size-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="max-w-[260px] font-medium">
                      <Link href={`/renewals/${p.id}`} className="block truncate after:absolute after:inset-0 focus-visible:outline-none">
                        {domainsOf(p)}
                      </Link>
                      <span className="block truncate text-[13px] font-normal text-muted-foreground md:hidden">{p.client.name}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-[220px] truncate md:table-cell">{p.client.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.plan.name}
                      {lines.length > 1 && <span className="block text-[13px] text-muted-foreground">+ domain{lines.length > 2 ? "s" : ""} this time</span>}
                    </TableCell>
                    <TableCell>
                      <span className="num">{formatShortDate(p.expiresAt, "en")}</span>
                      <span className="block text-[13px] text-muted-foreground">{p.status === "cancelled" ? "—" : daysLeftLabel(p.expiresAt, now)}</span>
                    </TableCell>
                    <TableCell className="text-right num">{formatEur(amount, "en")}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={st.primary} compact />
                        {st.flags.slice(0, 1).map((f) => (
                          <StatusBadge key={f.label} status={f} compact />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </BulkPlanForm>
      )}
      <p className="mt-3 text-[13px] text-muted-foreground">
        {pkgs.length} package{pkgs.length === 1 ? "" : "s"}. Amounts include VAT where it applies.
      </p>
    </>
  );
}
