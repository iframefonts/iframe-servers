import { render } from "@react-email/components";
import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { ReminderEmail, type EmailKind } from "@/emails/reminder-email";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { pickLocale } from "@/lib/i18n";
import { formatEur } from "@/lib/money";

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", req.url));
  const kind = (["d30", "d7", "d1", "overdue"].includes(req.nextUrl.searchParams.get("kind") ?? "") ? req.nextUrl.searchParams.get("kind") : "d30") as EmailKind;
  const locale = pickLocale(req.nextUrl.searchParams.get("lang"));
  const html = await render(
    createElement(ReminderEmail, {
      locale,
      kind,
      domain: "example.gr",
      expiryDate: formatDate(new Date(Date.now() + 30 * 86400_000), locale),
      amount: formatEur(14880, locale),
      payUrl: `${env.appUrl}/pay/preview`,
    }),
  );
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
