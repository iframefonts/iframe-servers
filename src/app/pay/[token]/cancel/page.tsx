import type { Metadata } from "next";
import { LinkButton } from "@/components/link-button";
import { PayMessage, PayShell } from "@/components/pay-shell";
import { t } from "@/lib/i18n";
import { loadPayPage } from "@/lib/payments/pay-page";

export const metadata: Metadata = { title: "Payment not completed", robots: { index: false, follow: false } };

export default async function CancelPage({ params, searchParams }: PageProps<"/pay/[token]/cancel">) {
  const { token } = await params;
  const data = await loadPayPage(token, (await searchParams).lang);
  const locale = data?.locale ?? "el";
  const s = t[locale];
  return (
    <PayShell locale={locale}>
      <PayMessage title={s.cancelTitle} body={s.cancelBody}>
        <LinkButton href={`/pay/${token}?lang=${locale}`} variant="default" size="lg" className="w-full">
          {s.tryAgain}
        </LinkButton>
      </PayMessage>
    </PayShell>
  );
}
