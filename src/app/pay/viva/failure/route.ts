import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/** Viva's Failure URL: /pay/viva/failure?s={orderCode} → our "not completed" page. */
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s");
  const lang = req.nextUrl.searchParams.get("lang")?.startsWith("en") ? "en" : "el";
  const pr = s ? await db.paymentRequest.findUnique({ where: { vivaOrderCode: s } }) : null;
  if (!pr) return NextResponse.redirect(new URL("/pay/unknown", req.url));
  return NextResponse.redirect(new URL(`/pay/${pr.token}/cancel?lang=${lang}`, req.url));
}
