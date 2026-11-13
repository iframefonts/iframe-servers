import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { PayShell } from "@/components/pay-shell";
import { Button } from "@/components/ui/button";
import { testCheckoutAllowed } from "@/lib/env";
import { afterPayment } from "@/lib/jobs";
import { formatEur } from "@/lib/money";
import { loadPayPage } from "@/lib/payments/pay-page";
import { recordPayment } from "@/lib/payments/record";

/** Stand-in for Viva Smart Checkout while VIVA_CLIENT_ID is empty. Never available with real keys. */
export default async function MockCheckout({ params, searchParams }: PageProps<"/pay/[token]/mock">) {
  if (!testCheckoutAllowed) notFound();
  const { token } = await params;
  const data = await loadPayPage(token, (await searchParams).lang);
  if (!data) notFound();

  async function pay() {
    "use server";
    if (!testCheckoutAllowed) return;
    const d = await loadPayPage(token);
    if (!d) return;
    const result = await recordPayment({
      provider: "viva",
      transactionId: `mock_${randomBytes(8).toString("hex")}`,
      paymentRequestId: d.pr.id,
      amountCents: d.pr.amountCents,
      paidAt: new Date(),
      raw: { mock: true },
    });
    await afterPayment(result);
    redirect(`/pay/${token}/success?lang=${data!.locale}`);
  }
  async function cancel() {
    "use server";
    redirect(`/pay/${token}/cancel?lang=${data!.locale}`);
  }

  return (
    <PayShell locale={data.locale}>
      <div className="rounded-2xl border-2 border-dashed border-warning p-6">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-warning">Test checkout · no real charge</p>
        <h1 className="mt-2 text-[22px] font-semibold">Viva Smart Checkout (simulated)</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {data.domains} · {formatEur(data.pr.amountCents, data.locale)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">With real Viva keys, the client sees Viva&apos;s card page here. Paying below records the payment exactly as Viva&apos;s webhook would.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <form action={pay} className="flex-1">
            <Button type="submit" size="lg" className="w-full">
              Simulate Successful Payment
            </Button>
          </form>
          <form action={cancel}>
            <Button type="submit" size="lg" variant="outline" className="w-full">
              Cancel
            </Button>
          </form>
        </div>
      </div>
    </PayShell>
  );
}
