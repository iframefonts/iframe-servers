/**
 * What a renewal charges. Hosting renews every period; each domain add-on rides along on the
 * hosting renewal it's due on (e.g. a .gr domain every 2nd year). The one place prices are summed.
 */

export type RenewalLine = {
  kind: "hosting" | "domain";
  /** Plan name for hosting, the domain name for domains */
  label: string;
  netCents: number;
  periodMonths: number;
  domainId?: string;
};

/** Domain dates line up with hosting dates; this absorbs month-end/day differences. */
const ALIGN_TOLERANCE_MS = 31 * 86400_000;

type PlanLike = { name: string; kind: "hosting" | "domain"; priceNetCents: number; periodMonths: number };
export type PackageForLines = {
  expiresAt: Date;
  customPriceNetCents: number | null;
  plan: PlanLike;
  domains?: { id: string; expiresAt: Date; customPriceNetCents: number | null; plan: PlanLike; website: { domain: string } }[];
};

/** Prisma include that loads everything renewalLines() needs. */
export const domainsInclude = { domains: { include: { plan: true, website: true }, orderBy: { createdAt: "asc" as const } } } as const;

export function domainIsDue(domainExpiresAt: Date, periodEnd: Date) {
  return domainExpiresAt.getTime() <= periodEnd.getTime() + ALIGN_TOLERANCE_MS;
}

export function renewalLines(pkg: PackageForLines, periodEnd: Date = pkg.expiresAt): RenewalLine[] {
  const lines: RenewalLine[] = [
    {
      kind: pkg.plan.kind,
      label: pkg.plan.name,
      netCents: pkg.customPriceNetCents ?? pkg.plan.priceNetCents,
      periodMonths: pkg.plan.periodMonths,
    },
  ];
  for (const d of pkg.domains ?? []) {
    if (!domainIsDue(d.expiresAt, periodEnd)) continue;
    lines.push({
      kind: "domain",
      label: d.website.domain,
      netCents: d.customPriceNetCents ?? d.plan.priceNetCents,
      periodMonths: d.plan.periodMonths,
      domainId: d.id,
    });
  }
  return lines;
}

export const linesNet = (lines: RenewalLine[]) => lines.reduce((s, l) => s + l.netCents, 0);

/** Net per year across hosting and domains (a 2-year domain counts half per year). */
export function annualNet(pkg: PackageForLines) {
  const year = (cents: number, months: number) => Math.round((cents / months) * 12);
  return (
    year(pkg.customPriceNetCents ?? pkg.plan.priceNetCents, pkg.plan.periodMonths) +
    (pkg.domains ?? []).reduce((s, d) => s + year(d.customPriceNetCents ?? d.plan.priceNetCents, d.plan.periodMonths), 0)
  );
}

export function parseLines(json: unknown): RenewalLine[] | null {
  return Array.isArray(json) ? (json as RenewalLine[]) : null;
}
