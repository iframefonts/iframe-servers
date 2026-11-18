import { PayShell } from "@/components/pay-shell";
import type { Locale } from "@/lib/i18n";
import type { LegalDoc } from "@/lib/legal";

export function LegalPage({ doc, locale, path }: { doc: LegalDoc; locale: Locale; path: string }) {
  return (
    <PayShell locale={locale} langHref={(l) => `${path}?lang=${l}`}>
      <article className="text-[15px] leading-relaxed">
        <h1 className="text-[28px] font-semibold leading-tight">{doc.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {locale === "el" ? "Τελευταία ενημέρωση" : "Last updated"}: {doc.updated}
        </p>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-6">
            <h2 className="text-[17px] font-semibold">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </PayShell>
  );
}
