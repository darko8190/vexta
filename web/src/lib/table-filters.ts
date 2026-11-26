/**
 * Column filters on a list, shaped by the column's kind: a number is a range, a date a range of
 * days, a reference or a choice a set of values, text a "contains".
 */
export type ColumnFilterType = "number" | "date" | "select" | "text";

export interface ColumnFilterValue {
  min?: string;
  max?: string;
  from?: string;
  to?: string;
  values?: string[];
  text?: string;
}

export type TableFilters = Record<string, ColumnFilterValue>;

export function isActive(value: ColumnFilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(
    value.min?.trim() || value.max?.trim() || value.from || value.to || value.values?.length || value.text?.trim(),
  );
}

/** Drops the empty ones, so a cleared field does not linger as a filter. */
export function cleanFilters(filters: TableFilters): TableFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => isActive(value)));
}

/** As the API reads them: f.{colonne}, f.{colonne}.min / .max, f.{colonne}.du / .au. */
export function filtersToQuery(filters: TableFilters): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(cleanFilters(filters))) {
    if (value.min?.trim()) query[`f.${key}.min`] = value.min.trim().replace(",", ".");
    if (value.max?.trim()) query[`f.${key}.max`] = value.max.trim().replace(",", ".");
    if (value.from) query[`f.${key}.du`] = value.from;
    if (value.to) query[`f.${key}.au`] = value.to;
    if (value.values?.length) query[`f.${key}`] = value.values.join(",");
    if (value.text?.trim()) query[`f.${key}`] = value.text.trim();
  }
  return query;
}
