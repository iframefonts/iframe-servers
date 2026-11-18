/**
 * Income categories for the Finance page. Each invoice line is matched against the
 * CategoryRule list (lowest position first): first the Elorus product title, then the
 * line's own text. No match → the product title, else "Other".
 * Matching ignores case and Greek accents ("Ιστοσελίδα" matches "ιστοσελιδ").
 */
export type Rule = { pattern: string; category: string; position: number };

export const OTHER = "Other";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el")
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

export function categorize(rules: Rule[], line: { title: string; sourceLabel?: string | null }): string {
  const sorted = [...rules].sort((a, b) => a.position - b.position).filter((r) => normalize(r.pattern));
  for (const text of [line.sourceLabel, line.title]) {
    if (!text) continue;
    const t = normalize(text);
    const hit = sorted.find((r) => t.includes(normalize(r.pattern)));
    if (hit) return hit.category.trim();
  }
  return line.sourceLabel?.trim() || OTHER;
}
