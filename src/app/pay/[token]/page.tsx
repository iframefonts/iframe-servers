import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { PayMessage, PayShell } from "@/components/pay-shell";
import { Button } from "@/components/ui/button";
import { addPeriod, formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { formatEur } from "@/lib/money";
import { loadPayPage } from "@/lib/payments/pay-page";

export const metadata: Metadata = { title: "Renewal", robots: { index: false, follow: false } };

export default async function PayPage({ params, searchParams }: PageProps<"/pay/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const data = await loadPayPage(token, sp.lang);
  if (!data) {
    return (
      <PayShell locale="el">
        <PayMessage title="—" body={`${t.el.notFound} / ${t.en.notFound}`} />
      </PayShell>
    );
  }
  const { pr, pkg, client, locale, state, domains } = data;
  const s = t[locale];
  const langHref = (l: string) => `/pay/${token}?lang=${l}`;

  if (state === "paid") {
    return (
      <PayShell locale={locale} langHref={langHref}>
        <PayMessage title={s.paidTitle} body={s.paidBody(formatDate(pkg.expiresAt, locale))} />
      </PayShell>
    );
  }
  if (state === "expired" || state === "cancelled") {
    return (
      <PayShell locale={locale} langHref={langHref}>
        <PayMessage title={state === "expired" ? s.expiredTitle : s.cancelledTitle} body={state === "expired" ? s.expiredBody : s.cancelledBody} />
      </PayShell>
    );
  }

  const amount = formatEur(pr.amountCents, locale);
  const newEnd = addPeriod(pr.periodEnd, pkg.plan.periodMonths);
  const vatLine =
    client.vatRegime === "domestic" ? s.vat(pr.vatRate) : client.vatRegime === "eu_reverse_charge" ? s.vatReverse : s.vatOutside;

  return (
    <PayShell locale={locale} langHref={langHref}>
      <p className="text-[15px] text-muted-foreground">{s.renewal}</p>
      <h1 className="mt-1 break-words text-[28px] font-semibold leading-tight">{domains}</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {s.expires}: {formatDate(pr.periodEnd, locale)}
      </p>

      {sp.error === "provider" && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
          {s.providerError}
        </p>
      )}

      <section className="mt-6 rounded-2xl border bg-card p-5" aria-label={s.total}>
        <dl className="space-y-2 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{s.plan}</dt>
            <dd className="text-right">{pkg.plan.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{s.period}</dt>
            <dd className="text-right">
              {s.months(pkg.plan.periodMonths)}, {s.until} {formatDate(newEnd, locale)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{s.net}</dt>
            <dd className="num">{formatEur(pr.netCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{vatLine}</dt>
            <dd className="num">{formatEur(pr.vatCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-3 text-[17px] font-semibold">
            <dt>{s.total}</dt>
            <dd className="num">{amount}</dd>
          </div>
        </dl>

        <form action={`/pay/${token}/checkout`} method="post" className="mt-5">
          <input type="hidden" name="lang" value={locale} />
          <Button type="submit" size="lg" className="h-12 w-full text-[17px]">
            {s.payByCard(amount)}
          </Button>
        </form>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {s.secure}
        </p>
      </section>

      <section className="mt-4 rounded-2xl border p-5 text-[15px]">
        <h2 className="text-[13px] font-medium text-muted-foreground">{s.invoiceTo}</h2>
        <p className="mt-1 font-medium">{client.name}</p>
        {client.vatNumber && <p className="num">ΑΦΜ {client.vatNumber}</p>}
        {client.address && <p>{client.address}</p>}
        <p className="mt-3 text-[13px] text-muted-foreground">{s.detailsWrong}</p>
      </section>
    </PayShell>
  );
}
