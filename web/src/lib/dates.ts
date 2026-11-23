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

/**
 * Today, and a day a given number of days from today, as YYYY-MM-DD in the browser's own time
 * zone.
 *
 * Not `toISOString().slice(0, 10)`: that is UTC, so from 19 h in Québec it already answers
 * tomorrow. A project that defaults to starting the day after the day it was created is the
 * kind of wrongness nobody notices until a report is off by one.
 */
export function todayIso(): string {
  return dayIso(0);
}

export function dayIso(offsetInDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetInDays);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A day and a clock time, the way somebody says it out loud: "22 novembre 2026 à 14 h 05".
 *
 * For a timestamp, not a date — the two are different fields and reading one as the other is
 * how a form filled at 23 h ends up dated tomorrow.
 */
export function formatMoment(iso: string | null | undefined): string {
  if (!iso) return "—";

  const date = new Date(iso);
  const day = date.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
  const time = date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  return `${day} à ${time.replace(":", " h ")}`;
}
