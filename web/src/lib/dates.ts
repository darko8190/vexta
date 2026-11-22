/**
 * A date with no time on it — an invoice's issue date, the day an expense was paid.
 *
 * Not `new Date(iso).toLocaleDateString()`: "2026-11-10" is parsed as midnight UTC, and east of
 * Greenwich that is still the 9th locally. An invoice dated a day before the day it says is a
 * document someone has to explain, so the value is formatted from its own parts instead.
 *
 * fr-CA writes a date as YYYY-MM-DD, which is what the API already stores, so nothing has to be
 * rearranged for it to read correctly here.
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : iso;
}
