import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { PayMessage, PayShell } from "@/components/pay-shell";
import { t } from "@/lib/i18n";
import { loadPayPage } from "@/lib/payments/pay-page";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

export default async function SuccessPage({ params, searchParams }: PageProps<"/pay/[token]/success">) {
  const { token } = await params;
  const data = await loadPayPage(token, (await searchParams).lang);
  const locale = data?.locale ?? "el";
  const s = t[locale];
  const paid = data?.state === "paid";
  return (
    <PayShell locale={locale}>
      <CircleCheck className="mb-4 size-10 text-success" aria-hidden />
      <PayMessage title={s.successTitle} body={paid ? s.successBody : s.successPending} />
    </PayShell>
  );
}
