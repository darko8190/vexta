"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One thing in a basket, as it was shown on the page.
 *
 * The title and the price are copies kept so the basket can be drawn without asking the API
 * again — a panel that had to fetch before it could show what is in it would be empty for a
 * moment every time somebody opened it.
 *
 * They are for display only. What the order actually costs is read from the catalogue by the
 * API when the order is placed: a price that travelled through a browser is a price the browser
 * could have chosen.
 */
export interface BasketItem {
  productId: string;
  title: string;
  unit: string | null;
  unitPrice: number;
  quantity: number;
}

export type Basket = BasketItem[];

const EMPTY: Basket = [];

function keyFor(slug: string): string {
  return `vexta:panier:${slug}`;
}

/**
 * The last value handed to React for each company, so repeated reads return the same object.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders when they differ. Parsing
 * the stored JSON afresh on every read would produce a new array every time and spin for ever,
 * so the parse happens on write and on a change from another tab, and reads come from here.
 */
const snapshots = new Map<string, Basket>();
const listeners = new Set<() => void>();

function read(slug: string): Basket {
  const cached = snapshots.get(slug);
  if (cached) return cached;

  let parsed: Basket = EMPTY;

  try {
    const stored = window.localStorage.getItem(keyFor(slug));
    if (stored) {
      const candidate: unknown = JSON.parse(stored);

      // Anything shaped wrong is treated as an empty basket rather than thrown: this is a
      // stranger's browser, the contents may be from an older version of the page, and losing a
      // basket is better than a shop that will not open.
      if (Array.isArray(candidate)) {
        parsed = candidate.filter(
          (item): item is BasketItem =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as BasketItem).productId === "string" &&
            typeof (item as BasketItem).quantity === "number" &&
            (item as BasketItem).quantity > 0,
        );
      }
    }
  } catch {
    // Private browsing, blocked storage, or unreadable contents. The shop still works; the
    // basket simply starts empty and will not survive a reload.
    parsed = EMPTY;
  }

  snapshots.set(slug, parsed);
  return parsed;
}

function write(slug: string, basket: Basket): void {
  snapshots.set(slug, basket);

  try {
    if (basket.length === 0) window.localStorage.removeItem(keyFor(slug));
    else window.localStorage.setItem(keyFor(slug), JSON.stringify(basket));
  } catch {
    // Nothing to do and nothing to say: the basket is still correct in this tab, it just will
    // not be there after a reload.
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab on the same shop. The cached snapshot is dropped so the next read reparses, and
  // somebody with two tabs open does not order twice what they added once.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("vexta:panier:")) {
      snapshots.clear();
      for (const current of listeners) current();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The basket for one company's shop window, kept in the visitor's own browser.
 *
 * Per company on purpose. Two contractors deliver separately, bill separately and are two
 * different conversations; one basket spanning both would be a checkout that cannot be
 * completed.
 *
 * Nothing is sent anywhere until the order is placed. A basket is somebody thinking, and a
 * company does not need to watch them think.
 */
export function useBasket(slug: string) {
  const items = useSyncExternalStore(
    subscribe,
    () => read(slug),
    // The server renders an empty basket, always: localStorage does not exist there, and a shop
    // that claimed to know what is in it before the browser spoke would mismatch on hydration.
    () => EMPTY,
  );

  const add = useCallback(
    (item: Omit<BasketItem, "quantity">, quantity = 1) => {
      const current = read(slug);
      const existing = current.find((line) => line.productId === item.productId);

      write(
        slug,
        existing
          ? current.map((line) =>
              line.productId === item.productId
                ? { ...line, ...item, quantity: line.quantity + quantity }
                : line,
            )
          : [...current, { ...item, quantity }],
      );
    },
    [slug],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const current = read(slug);

      // Down to nothing is a removal. Somebody clearing the box meant to take it out, and
      // leaving a line at zero would be a line they have to remove twice.
      write(
        slug,
        quantity <= 0
          ? current.filter((line) => line.productId !== productId)
          : current.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
      );
    },
    [slug],
  );

  const remove = useCallback(
    (productId: string) => setQuantity(productId, 0),
    [setQuantity],
  );

  const clear = useCallback(() => write(slug, EMPTY), [slug]);

  const count = items.reduce((total, line) => total + line.quantity, 0);
  const subtotal = items.reduce((total, line) => total + line.quantity * line.unitPrice, 0);

  return { items, count, subtotal, add, setQuantity, remove, clear };
}
