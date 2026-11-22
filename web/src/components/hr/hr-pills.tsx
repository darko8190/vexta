"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface HrPill {
  key: string;
  label: string;
  count: number;
}

/**
 * The section switcher. A scrolling row at every width — there are only four of these and they
 * read as one band, which is what the counts are for: you see the whole department at a glance
 * before choosing where to go.
 */
export function HrPills({
  pills,
  active,
  onSelect,
}: {
  pills: HrPill[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sections des ressources humaines"
      className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {pills.map((pill) => {
        const current = pill.key === active;
        return (
          <button
            key={pill.key}
            type="button"
            role="tab"
            aria-selected={current}
            onClick={() => onSelect(pill.key)}
            className={cn(
              // 44px: these are pressed with a thumb on site as often as clicked at a desk.
              "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              "transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              current
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {pill.label}
            <Badge
              variant={current ? "secondary" : "outline"}
              className="tabular-nums"
            >
              {pill.count}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
