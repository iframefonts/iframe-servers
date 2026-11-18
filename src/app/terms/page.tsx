import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { pickLocale } from "@/lib/i18n";
import { terms } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms" };

export default async function TermsPage({ searchParams }: PageProps<"/terms">) {
  const { lang } = await searchParams;
  const locale = pickLocale(typeof lang === "string" ? lang : undefined);
  return <LegalPage doc={terms[locale]} locale={locale} path="/terms" />;
}
