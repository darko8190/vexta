"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface DetailSection {
  key: string;
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The record's own navigation. A rail on the left from md up; a horizontal scroller above the
 * content on a phone, because a 180px sidebar on a 375px screen leaves nothing for the content.
 * Same component either way, so the two never drift apart.
 */
export function ClientDetailNav({
  sections,
  active,
  onSelect,
}: {
  sections: DetailSection[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Sections du client"
      className={cn(
        // Phone: a scrollable row, with the gutter bled through so the first and last pills
        // are not glued to the screen edge.
        "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2",
        // md and up: a fixed rail that stays put while the section scrolls.
        "md:mx-0 md:w-52 md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0",
      )}
    >
      {sections.map((section) => {
        const Icon = section.icon;
        const current = section.key === active;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelect(section.key)}
            aria-current={current ? "page" : undefined}
            className={cn(
              // 44px on a phone, which is the smallest target a thumb hits reliably; 40 is
              // enough once there is a pointer, and keeps the rail compact.
              "flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium md:h-10",
              "transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              "md:w-full",
              current
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{section.label}</span>
            <Badge
              variant={current ? "default" : "secondary"}
              className="ml-auto shrink-0 tabular-nums"
            >
              {section.count}
            </Badge>
          </button>
        );
      })}
    </nav>
  );
}
