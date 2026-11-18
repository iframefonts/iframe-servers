import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { pickLocale } from "@/lib/i18n";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  const { lang } = await searchParams;
  const locale = pickLocale(typeof lang === "string" ? lang : undefined);
  return <LegalPage doc={privacy[locale]} locale={locale} path="/privacy" />;
}
