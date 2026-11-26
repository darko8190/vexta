"use client";

import { useSyncExternalStore } from "react";

/**
 * Admin or employee view, for someone who is both: the owner who also works on the jobs.
 *
 * A view, not a permission. In « employé » the menu is the one an employee has and the
 * management buttons step aside, so the day's work is not buried under the office's; the API
 * still answers to the person's real role. Kept in this browser, so the phone in the truck can
 * stay on employee while the office computer stays on admin.
 */
export type ViewMode = "admin" | "employe";

const KEY = "vexta:view-mode";
const listeners = new Set<() => void>();

function read(): ViewMode {
  try {
    return window.localStorage.getItem(KEY) === "employe" ? "employe" : "admin";
  } catch {
    return "admin";
  }
}

export function setViewMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Private window: the choice lasts as long as the page.
  }
  current = mode;
  listeners.forEach((listener) => listener());
}

let current: ViewMode | null = null;

function snapshot(): ViewMode {
  if (current === null) current = read();
  return current;
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => "admin",
  );
}
