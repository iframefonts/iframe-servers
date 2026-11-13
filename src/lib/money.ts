import type { VatRegime } from "@/generated/prisma/enums";

/** VAT rate in percent for a client's VAT regime. Confirm the foreign cases with the accountant. */
export function vatRateFor(regime: VatRegime): number {
  switch (regime) {
    case "domestic":
      return 24;
    case "eu_reverse_charge": // EU business with VIES-valid VAT number
    case "non_eu": // outside the scope of Greek VAT
      return 0;
  }
}

export function amountsFor(netCents: number, regime: VatRegime) {
  const vatRate = vatRateFor(regime);
  const vatCents = Math.round((netCents * vatRate) / 100);
  return { netCents, vatCents, amountCents: netCents + vatCents, vatRate };
}

export function formatEur(cents: number, locale: "el" | "en" = "el"): string {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** "148.80" → 14880. Accepts comma or dot decimals. */
export function parseEurToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
