/** A-0001. Padded so the column sorts and scans cleanly, like a client's or a project's number. */
export function formatProductNumber(n: number): string {
  return `A-${String(n).padStart(4, "0")}`;
}

const currency = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
});

/**
 * A price, and what it buys when the product carries a unit: "4,50 $ / pi".
 *
 * The unit is a second optional argument rather than a helper of its own, for the same reason as
 * on `quantity` below: every screen that prints a price already comes through here, so the ones
 * that know the unit gain it by passing it, and the price history — where a unit would repeat on
 * every row — keeps calling this with one argument.
 */
export function money(amount: number | null | undefined, unit?: string | null): string {
  if (amount == null) return "—";
  const formatted = currency.format(amount);
  return unit ? `${formatted} / ${unit}` : formatted;
}

/**
 * A quantity with as many decimals as it actually has, up to the three the column stores. "12"
 * for twelve boxes and "2,5" for two and a half metres, never "12,000".
 *
 * With the product's unit it becomes "12 pi", which is the only form that answers "twelve of
 * what". Joined with a non-breaking space so a narrow column never leaves the unit on its own
 * line, where it would read as a separate figure.
 */
export function quantity(value: number | null | undefined, unit?: string | null): string {
  if (value == null) return "—";
  const formatted = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** The margin, which is a percentage and not money. */
export function percent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 }).format(value)} %`;
}

/** Minutes as someone would say them out loud: 90 minutes is "1 h 30". */
export function duration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/**
 * A moment, for the history tables. These values carry a time, unlike an invoice's date, so
 * they are parsed as instants and shown in the reader's own timezone — which is where the
 * delivery was received.
 */
export function timestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * "49,99" and "49.99" both, because a price is typed with a comma here. "invalid" rather than
 * NaN so a typo can be refused with a sentence instead of saved as nothing.
 */
export function parseDecimal(
  value: string,
  options: { allowNegative?: boolean; places?: number } = {},
): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const places = options.places ?? 2;
  const sign = options.allowNegative ? "-?" : "";
  const decimals = places > 0 ? `([.]\\d{1,${places}})?` : "";

  if (!new RegExp(`^${sign}\\d+${decimals}$`).test(normalized)) return "invalid";

  return Number(normalized);
}

/** A number back into a field, with the comma this keyboard types. */
export function decimalField(value: number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}
