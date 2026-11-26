/** Lower case without accents, so "beton" finds "Béton". */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Whether a row matches what was typed in a list's search bar: every word somewhere in the
 * fields given, in any order. An empty search matches everything.
 */
export function matchesSearch(search: string, ...fields: (string | number | null | undefined)[]): boolean {
  const words = foldText(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText(fields.filter((field) => field != null && field !== "").join(" "));
  return words.every((word) => haystack.includes(word));
}
