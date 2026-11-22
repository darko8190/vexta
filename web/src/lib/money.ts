/** Accepts "49", "49.99" and "49,99" — a price is written with a comma in fr-CA. */
export function parseAmountToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+([.]\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** The amount as a form field should show it: "49" or "49,99", never "49.00". */
export function centsToFieldValue(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

export function formatCents(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * An amount already in dollars, as fr-CA money: "1 234,56 $".
 *
 * Distinct from formatCents, which takes an integer number of cents. The API sends decimals for
 * everything that was always a decimal — an invoice total, an account balance — and converting
 * those to cents just to format them is a rounding step nobody asked for.
 *
 * Always two decimals, unlike formatCents: these are figures people reconcile, and a balance
 * that reads "40 $" beside one that reads "39,95 $" is a column that will not line up.
 */
export function formatAmount(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
