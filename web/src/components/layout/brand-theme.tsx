"use client";

import { brandStylesheet } from "@/lib/brand-color";

/**
 * Repaints the application in the company's colour.
 *
 * A plain style element rather than inline variables on documentElement: the dark theme needs
 * its own values, and a `.dark` rule is the only way to give it them without this component
 * having to know which theme is current and re-run when it changes.
 *
 * It renders during the first paint of the dashboard, which is after the session is known — so
 * nobody sees a blue button turn green under their pointer.
 */
export function BrandTheme({ color }: { color: string | null | undefined }) {
  const sheet = brandStylesheet(color);
  if (!sheet) return null;

  // The content is built from a validated #RRGGBB and numbers computed from it; nothing from
  // the database reaches the stylesheet as text.
  return <style data-vexta-brand="">{sheet}</style>;
}
