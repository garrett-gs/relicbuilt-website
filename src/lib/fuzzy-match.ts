/**
 * Fuzzy, fraction-aware matching for terse vendor product names.
 *
 * Item names are stored as SKU-ish codes ("IMP 3/4 BIRCH WHT RAW C2 VC WPF"),
 * so a plain substring search on "3/4-inch birch plywood" misses. We normalize
 * fractions and inch marks, then rank items by how many query tokens they
 * contain — the best semantic match floats to the top even without every word.
 */

export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/½/g, "1/2").replace(/¼/g, "1/4").replace(/¾/g, "3/4")
    .replace(/⅜/g, "3/8").replace(/⅝/g, "5/8").replace(/⅞/g, "7/8")
    .replace(/⅓/g, "1/3").replace(/⅔/g, "2/3")
    .replace(/[""“”]/g, "")
    .replace(/\b(inch|inches|in)\b/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant query tokens (drop noise like single letters, keep fractions). */
export function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(" ")
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/**
 * Rank `items` by how many query tokens appear in their text. Returns only
 * items that match at least one token, most-matched first. With an empty query
 * it returns the items unchanged.
 */
export function fuzzyRank<T>(query: string, items: T[], getText: (t: T) => string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return items;
  return items
    .map((it) => {
      const hay = normalizeText(getText(it));
      const score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
}
