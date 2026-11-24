import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Which columns a table shows, and in what order, remembered per table in this browser.
 *
 * A per-person convenience, not shared data: one dispatcher wants the telephone column and
 * another never looks at it. Held in localStorage behind useSyncExternalStore so the server
 * renders the default layout and the browser switches to the stored one without a mismatch.
 */
export interface TableLayout {
  order: string[];
  hidden: string[];
}

const EVENT = "vexta-table-layout";

function storageKey(id: string) {
  return `vexta.table.${id}`;
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

export function useTableLayout(id: string, keys: string[], hiddenByDefault: string[]) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => null,
  );

  const keysSignature = keys.join("|");
  const defaultsSignature = hiddenByDefault.join("|");

  const layout = useMemo<TableLayout>(() => {
    const known = keysSignature.split("|");
    let stored: Partial<TableLayout> = {};
    if (raw) {
      try {
        stored = JSON.parse(raw) as Partial<TableLayout>;
      } catch {
        stored = {};
      }
    }
    // Columns added since the layout was saved go at the end; removed ones are dropped.
    const order = (stored.order ?? []).filter((key) => known.includes(key));
    for (const key of known) if (!order.includes(key)) order.push(key);
    const hidden = (stored.hidden ?? (defaultsSignature ? defaultsSignature.split("|") : [])).filter((key) =>
      known.includes(key),
    );
    return { order, hidden };
  }, [raw, keysSignature, defaultsSignature]);

  const save = useCallback(
    (next: TableLayout | null) => {
      try {
        if (next) window.localStorage.setItem(storageKey(id), JSON.stringify(next));
        else window.localStorage.removeItem(storageKey(id));
      } catch {
        // Private windows and blocked storage: the layout simply is not remembered.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [id],
  );

  return { layout, save };
}
