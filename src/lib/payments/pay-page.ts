import "server-only";
import { db } from "@/lib/db";
import { pickLocale, type Locale } from "@/lib/i18n";
import { payPageState } from "@/lib/payments/requests";

export async function loadPayPage(token: string, lang?: string | string[]) {
  const pr = await db.paymentRequest.findUnique({
    where: { token },
    include: { package: { include: { client: true, plan: true, websites: { include: { website: true } } } } },
  });
  if (!pr) return null;
  const locale: Locale = pickLocale(typeof lang === "string" ? lang : undefined, pr.package.client.language);
  const state = payPageState(pr, pr.package.status);
  const domains = pr.package.websites.map((w) => w.website.domain).join(", ") || pr.package.plan.name;
  return { pr, pkg: pr.package, client: pr.package.client, locale, state, domains };
}
