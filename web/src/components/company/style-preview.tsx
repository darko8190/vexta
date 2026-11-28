"use client";

import { useCallback, useState } from "react";
import { styleTokensFor } from "@/lib/public-page-style";
import type { PublicPageStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A miniature of the public page drawn with one arrangement's own class names.
 *
 * Drawn at full size and scaled down rather than redrawn small, so what the owner sees in the
 * picker is the real arrangement and cannot drift from it.
 */
export function StylePreview({ style, name }: { style: PublicPageStyle; name?: string }) {
  const s = styleTokensFor(style);
  const WIDTH = 760;
  const HEIGHT = 420;
  const [scale, setScale] = useState(0.3);

  // Scaled to whatever width the picker gives it, so the miniature fills its frame.
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WIDTH));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const SCALE = scale;

  return (
    <div
      ref={measure}
      className="pointer-events-none relative w-full overflow-hidden rounded-md border border-border bg-background select-none"
      style={{ height: HEIGHT * SCALE }}
      aria-hidden="true"
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: WIDTH, transform: `scale(${SCALE})` }}>
        <div className={s.accentBar} />
        <header className={s.header}>
          <div className={cn(s.container, "py-8")}>
            <div className={s.headerInner}>
              <div className={s.logoFrame}>
                <div className="size-8 rounded bg-primary/70" />
              </div>
              <div className={cn(s.headerText, "flex-1")}>
                <p className={s.title}>{name || "Votre entreprise"}</p>
                <p className={s.headline}>Votre accroche, en une ligne.</p>
              </div>
            </div>
          </div>
        </header>
        <div className={cn(s.container, "py-8")}>
          <p className={s.sectionTitle}>Produits et services</p>
          <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${s.perRow}, minmax(0, 1fr))` }}>
            {Array.from({ length: s.perRow }, (_, index) => index).map((index) => (
              <div key={index} className={cn("overflow-hidden", s.card)}>
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-2/3 rounded bg-foreground/60" />
                  <div className="h-3 w-1/3 rounded bg-primary" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
