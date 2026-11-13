import { AlertCircle, ArrowRight, CircleCheck, Clock } from "lucide-react";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { formatDate } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { getAttention, getTodayCards, type AttentionItem } from "@/lib/queries";

export const metadata = { title: "Today" };

const SEVERITY_ICON = { 1: AlertCircle, 2: AlertCircle, 3: Clock } as const;

export default async function TodayPage() {
  const [{ items }, cards] = await Promise.all([getAttention(), getTodayCards()]);
  const today = formatDate(new Date(), "en");

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={today}
        actions={
          <LinkButton href="/reports">Reports</LinkButton>
        }
      />

      <Section
        title="Needs attention"
        description={items.length ? `${items.length} item${items.length === 1 ? "" : "s"}, most urgent first` : undefined}
      >
        {items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-6">
            <CircleCheck className="size-6 text-success" aria-hidden />
            <div>
              <p className="text-[15px] font-medium">Nothing needs you today.</p>
              <p className="text-sm text-muted-foreground">Reminders go out automatically at 09:00. Payments and invoices appear here only if something goes wrong.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {items.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="At a glance">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="Overdue"
            value={formatEur(cards.overdue.netCents, "en")}
            sub={`${cards.overdue.count} package${cards.overdue.count === 1 ? "" : "s"}, net`}
            href="/renewals?filter=overdue"
            alert={cards.overdue.count > 0}
          />
          <Card
            label="Due in 30 days"
            value={formatEur(cards.due30.netCents, "en")}
            sub={`${cards.due30.count} package${cards.due30.count === 1 ? "" : "s"}, net`}
            href="/renewals?filter=expiring30"
          />
          <Card
            label={`Income ${cards.incomeYear.year}`}
            value={formatEur(cards.incomeYear.gross, "en")}
            sub={`${formatEur(cards.incomeYear.net, "en")} net + ${formatEur(cards.incomeYear.vat, "en")} VAT`}
            href="/reports"
          />
          <Card label="Recurring revenue" value={formatEur(cards.arrNetCents, "en")} sub="per year, net, active packages" href="/reports" />
        </div>
      </Section>
    </>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = SEVERITY_ICON[item.severity];
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <Icon className={item.severity === 3 ? "hidden size-5 shrink-0 text-muted-foreground sm:block" : "hidden size-5 shrink-0 text-destructive sm:block"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{item.title}</p>
        <p className="text-sm text-muted-foreground">{item.detail}</p>
      </div>
      <LinkButton href={item.href} className="self-start sm:self-center">
        {item.action}
        <ArrowRight aria-hidden />
      </LinkButton>
    </li>
  );
}

function Card({ label, value, sub, href, alert }: { label: string; value: string; sub: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold num ${alert ? "text-destructive" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>
    </Link>
  );
}
