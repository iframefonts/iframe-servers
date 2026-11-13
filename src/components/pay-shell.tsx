import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

/** Client-facing frame: restrained branding that defers to the content (HIG › Branding). */
export function PayShell({ locale, children, langHref }: { locale: Locale; children: ReactNode; langHref?: (l: Locale) => string }) {
  return (
    <div lang={locale} className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-6 sm:pt-10">
        <span className="text-[15px] font-semibold tracking-tight">iFRAME</span>
        {langHref && (
          <nav aria-label={locale === "el" ? "Γλώσσα" : "Language"} className="flex gap-1 text-[13px]">
            {(["el", "en"] as const).map((l) => (
              <Link
                key={l}
                href={langHref(l)}
                aria-current={l === locale ? "true" : undefined}
                className={l === locale ? "rounded-md bg-foreground/[0.07] px-2 py-1 font-semibold" : "rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"}
              >
                {l === "el" ? "Ελληνικά" : "English"}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto w-full max-w-lg px-4 pb-8 text-[13px] text-muted-foreground">iFRAME Design Studio · info@iframe.gr</footer>
    </div>
  );
}

export function PayMessage({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-[17px] leading-relaxed text-muted-foreground">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
