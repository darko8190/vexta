"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NavSection {
  key: string;
  label: string;
  /** The badge. Omitted for a section that is one thing rather than a list of them. */
  count?: number;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The navigation inside a screen: a rail on the left from md up, a horizontal scroller above
 * the content on a phone, where a 208 px sidebar on a 375 px screen would leave nothing for the
 * content. One component for both, so the two can never drift apart.
 *
 * The count sits at the right edge of each row rather than against the label, which is what
 * lines the numbers up under each other and makes the rail readable as a summary of the record
 * before anything in it is opened.
 *
 * The rail is wide enough for the longest label the application actually has — "Historique de
 * réceptions" and its badge — because a label that does not fit pushes its own badge past the
 * edge, and one row out of eight being wider is what makes a straight column look crooked. The
 * label also truncates, with the full text on hover: that is the safety net, not the plan, so a
 * longer label added later degrades to an ellipsis instead of breaking the column again.
 */
export function SectionNav({
  sections,
  active,
  onSelect,
  label,
}: {
  sections: NavSection[];
  active: string;
  onSelect: (key: string) => void;
  /** What this set of sections belongs to, for anyone listening rather than looking. */
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        // Phone: a scrollable row, with the page gutter bled through so the first and last
        // items are not glued to the screen edge.
        "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2",
        // md and up: a fixed rail that stays put while the section beside it scrolls.
        "md:mx-0 md:w-64 md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0",
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
              // 44px on a phone, the smallest target a thumb hits reliably; 40 is enough once
              // there is a pointer, and keeps the rail compact.
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
            {/* title, not a tooltip component: this is a fallback for a label the rail cannot
                fit, and a tooltip on every row of every rail would be furniture. */}
            <span className="min-w-0 truncate" title={section.label}>
              {section.label}
            </span>
            {section.count !== undefined && (
              <Badge
                variant={current ? "default" : "secondary"}
                className="ml-auto shrink-0 tabular-nums"
              >
                {section.count}
              </Badge>
            )}
          </button>
        );
      })}
    </nav>
  );
}
