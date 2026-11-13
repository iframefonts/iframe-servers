import { NextResponse, type NextRequest } from "next/server";
import { pickLocale } from "@/lib/i18n";
import { loadPayPage } from "@/lib/payments/pay-page";
import { startVivaCheckout } from "@/lib/payments/providers";
import { getOrCreatePaymentRequest } from "@/lib/payments/requests";

/** POST from the pay page → Viva Smart Checkout. Status is checked before any redirect. */
export async function POST(req: NextRequest, ctx: RouteContext<"/pay/[token]/checkout">) {
  const { token } = await ctx.params;
  const form = await req.formData();
  const lang = pickLocale(String(form.get("lang") ?? ""));
  const back = (q = "") => NextResponse.redirect(new URL(`/pay/${token}?lang=${lang}${q}`, req.url), 303);

  const data = await loadPayPage(token, lang);
  if (!data || data.state !== "open") return back();
  let pr: { id: string; token: string; amountCents: number } = data.pr;
  // Still the current period: refresh the snapshot in case the price changed since the email.
  if (+data.pr.periodEnd === +data.pkg.expiresAt) pr = await getOrCreatePaymentRequest(data.pkg.id);

  try {
    const url = await startVivaCheckout({
      pr,
      description: `Hosting ${data.domains} (${data.pkg.plan.name})`,
      email: data.client.emails[0],
      customerName: data.client.name,
      locale: lang,
    });
    return NextResponse.redirect(url, 303);
  } catch (err) {
    console.error("[pay] Viva checkout failed", err);
    return back("&error=provider");
  }
}
