export const domainRe = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "https://www.Example.gr/" → "example.gr" */
export function normalizeDomain(input: string) {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
