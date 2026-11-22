"use client";

import { code128Svg } from "@/lib/barcode";

/**
 * The barcode as it is printed on the box, with the characters under it the way every shelf
 * label has them — a scanner reads the bars, a person reads the line.
 *
 * A value Code 128 cannot carry (an accent, a dash someone pasted) shows as plain text instead
 * of nothing: the code is still the code, and a symbol no scanner would accept is worse than
 * none. The markup is generated from module widths alone, so there is nothing in it to escape.
 */
export function ProductBarcode({ value, className }: { value: string; className?: string }) {
  const svg = code128Svg(value);

  if (svg === null) {
    return <span className="font-mono text-sm text-muted-foreground">{value}</span>;
  }

  return (
    <div className={className}>
      <div
        className="h-12 w-full max-w-64 text-foreground"
        role="img"
        aria-label={`Code à barres ${value}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="mt-1 max-w-64 text-center font-mono text-xs tracking-[0.25em] text-muted-foreground">
        {value}
      </div>
    </div>
  );
}
