import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * The order someone wants the views of a screen in, remembered per screen in this browser.
 *
 * Same approach as the table layouts: a personal convenience kept in localStorage behind
 * useSyncExternalStore, so the server renders the default order and the browser switches to the
 * stored one without a mismatch. Views added since the order was saved go at the end.
 */
const EVENT = "vexta-view-order";

function storageKey(id: string) {
  return `vexta.views.${id}`;
}

function read(id: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useViewOrder(id: string, keys: string[]) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => null,
  );
  const signature = keys.join("|");

  const order = useMemo(() => {
    const known = signature ? signature.split("|") : [];
    let stored: string[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) stored = parsed.filter((key): key is string => typeof key === "string");
      } catch {
        stored = [];
      }
    }
    const result = stored.filter((key) => known.includes(key));
    for (const key of known) if (!result.includes(key)) result.push(key);
    return result;
  }, [raw, signature]);

  const save = useCallback(
    (next: string[] | null) => {
      try {
        if (next) window.localStorage.setItem(storageKey(id), JSON.stringify(next));
        else window.localStorage.removeItem(storageKey(id));
      } catch {
        // Blocked storage: the order simply is not remembered.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [id],
  );

  return { order, save, customized: raw !== null };
}

/** The items put in the stored order. */
export function applyOrder<T>(items: T[], order: string[], keyOf: (item: T) => string): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (rank.get(keyOf(a)) ?? 0) - (rank.get(keyOf(b)) ?? 0));
}
