import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { confirmVivaTransaction } from "@/lib/payments/viva-confirm";

/**
 * Viva's Success URL (set on the payment source): /pay/viva/success?t={transactionId}&s={orderCode}.
 * Confirms right away so the client sees "paid"; the webhook remains the source of truth.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  const s = req.nextUrl.searchParams.get("s");
  const lang = req.nextUrl.searchParams.get("lang")?.startsWith("en") ? "en" : "el";
  let token: string | undefined;
  if (t) {
    try {
      const r = await confirmVivaTransaction(t);
      token = r.token;
    } catch (err) {
      console.error("[viva return] confirm failed", err);
    }
  }
  if (!token && s) token = (await db.paymentRequest.findUnique({ where: { vivaOrderCode: s } }))?.token;
  if (!token) return NextResponse.redirect(new URL("/pay/unknown", req.url));
  return NextResponse.redirect(new URL(`/pay/${token}/success?lang=${lang}`, req.url));
}
