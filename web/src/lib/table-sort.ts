/** Which column a table is sorted by, and which way. */
export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/** The default of every numbered list: the newest number first. */
export const NUMBER_DESC: SortState = { key: "numero", dir: "desc" };

/** As the API reads it: tri and ordre. */
export function sortToQuery(sort: SortState | null | undefined): Record<string, string> {
  return sort ? { tri: sort.key, ordre: sort.dir } : {};
}

/** A press on a heading: the same column flips, another one starts ascending. */
export function nextSort(current: SortState | null | undefined, key: string): SortState {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

type Sortable = string | number | boolean | null | undefined;

/** Sorts rows already in hand, for a table that is not paged by the API. Empty values last. */
export function sortRows<T>(rows: T[], sort: SortState | null | undefined, value: (row: T, key: string) => Sortable): T[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a, sort.key);
    const right = value(b, sort.key);
    if (left == null || left === "") return right == null || right === "" ? 0 : 1;
    if (right == null || right === "") return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right), "fr-CA", { numeric: true, sensitivity: "base" }) * factor;
  });
}

/** The sort values of a row by column key, for sortRows. */
export function byKeys<T>(fields: (row: T) => Record<string, Sortable>): (row: T, key: string) => Sortable {
  return (row, key) => fields(row)[key];
}
