"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReorderViewsDialog } from "@/components/layout/reorder-views-dialog";
import { applyOrder, useViewOrder } from "@/hooks/use-view-order";
import { cn } from "@/lib/utils";

/** How much of something is set up: 1 of 2 parts, 3 of 3. */
export interface SetupProgress {
  done: number;
  total: number;
}

export interface NavSection {
  key: string;
  label: string;
  /** The badge. Omitted for a section that is one thing rather than a list of them. */
  count?: number;
  /**
   * How much of the section is set up, for screens of settings: « 1/2 » in amber while parts
   * remain, green once they are all done. Omitted where the question does not apply.
   */
  status?: SetupProgress;
  /**
   * Things in the section that need the office's attention — a line added without a price.
   * A red dot, closed or open, until there are none.
   */
  alert?: number;
  /** What the red dot means, for the tooltip and a screen reader. */
  alertLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** « 1/2 », coloured by whether everything is done, with the words for a screen reader. */
export function SetupFraction({ progress, className }: { progress: SetupProgress; className?: string }) {
  const complete = progress.done >= progress.total;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        complete
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      <span aria-hidden>
        {progress.done}/{progress.total}
      </span>
      <span className="sr-only">
        {progress.done} sur {progress.total} configuré{progress.done > 1 ? "s" : ""}
      </span>
    </span>
  );
}

/**
 * The navigation inside a screen: a narrow rail of icons on the left from md up, a horizontal
 * scroller above the content on a phone.
 *
 * The rail behaves like the main menu: icons only, opening over the content when the pointer
 * rests on it, and falling shut again once a section is chosen. The content beside it keeps
 * its width, so nothing moves when the rail opens.
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
  // Set when a section is picked with the pointer, so the rail closes over the page just opened
  // even though the pointer is still on it. Cleared when the pointer leaves.
  const [dismissed, setDismissed] = useState(false);
  const [reordering, setReordering] = useState(false);
  // Each person puts the views in their own order, remembered per screen.
  const { order, save } = useViewOrder(label, sections.map((section) => section.key));
  const ordered = applyOrder(sections, order, (section) => section.key);

  return (
    <div className="md:w-12 md:shrink-0">
      <nav
        aria-label={label}
        onPointerLeave={() => setDismissed(false)}
        className={cn(
          "group/secnav",
          // Phone: a scrollable row, with the page gutter bled through.
          "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2",
          // md and up: a rail of icons that stays put while the section beside it scrolls.
          "md:sticky md:top-0 md:z-20 md:mx-0 md:w-12 md:flex-col md:overflow-hidden md:rounded-xl md:border md:border-transparent md:bg-background md:p-1",
          "md:transition-[width,box-shadow,border-color] md:duration-200 md:ease-out motion-reduce:transition-none",
          !dismissed && [
            "md:hover:w-64 md:hover:border-border md:hover:shadow-xl md:hover:delay-100",
            "md:focus-within:w-64 md:focus-within:border-border md:focus-within:shadow-xl",
          ],
        )}
      >
        {ordered.map((section) => {
          const Icon = section.icon;
          const current = section.key === active;

          return (
            <button
              key={section.key}
              type="button"
              onClick={(event) => {
                onSelect(section.key);
                // A keyboard user keeps the open rail and their place in it.
                if (event.detail === 0) return;
                event.currentTarget.blur();
                setDismissed(true);
              }}
              aria-current={current ? "page" : undefined}
              title={section.label}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium md:h-10 md:w-full",
                "transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                current
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <span className="relative flex shrink-0">
                <Icon className="size-4 shrink-0" />
                {/* While the rail is shut, a dot on the icon still says what the label would. */}
                <ClosedMarker section={section} />
              </span>
              <span
                className={cn(
                  "min-w-0 truncate whitespace-nowrap",
                  // Faded rather than clipped mid-letter while the rail is closed.
                  "md:opacity-0 md:transition-opacity md:duration-200 md:group-hover/secnav:opacity-100 md:group-focus-within/secnav:opacity-100",
                )}
              >
                {section.label}
              </span>
              {(section.status || section.count !== undefined || (section.alert ?? 0) > 0) && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 md:opacity-0 md:group-hover/secnav:opacity-100 md:group-focus-within/secnav:opacity-100">
                  {(section.alert ?? 0) > 0 && (
                    <span
                      className="inline-flex size-2 rounded-full bg-destructive"
                      title={section.alertLabel ?? "À vérifier"}
                    >
                      <span className="sr-only">{section.alertLabel ?? "À vérifier"}</span>
                    </span>
                  )}
                  {section.status && <SetupFraction progress={section.status} />}
                  {section.count !== undefined && (
                    <Badge variant={current ? "default" : "secondary"} className="tabular-nums">
                      {section.count}
                    </Badge>
                  )}
                </span>
              )}
            </button>
          );
        })}
        {sections.length > 2 && (
          <button
            type="button"
            onClick={() => setReordering(true)}
            title="Réorganiser les vues"
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground md:h-9 md:w-full",
              "hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <ArrowUpDown className="size-4 shrink-0 opacity-60" />
            <span className="min-w-0 truncate whitespace-nowrap md:opacity-0 md:transition-opacity md:duration-200 md:group-hover/secnav:opacity-100 md:group-focus-within/secnav:opacity-100">
              Réorganiser
            </span>
          </button>
        )}
      </nav>
      <ReorderViewsDialog
        open={reordering}
        onOpenChange={setReordering}
        items={ordered.map((section) => ({ key: section.key, label: section.label }))}
        onSave={save}
        onReset={() => save(null)}
      />
    </div>
  );
}

/** The dot shown on a closed rail: amber while a setup is incomplete, green once done, a count otherwise. */
function ClosedMarker({ section }: { section: NavSection }) {
  const hidden = "hidden md:flex md:group-hover/secnav:hidden md:group-focus-within/secnav:hidden";
  // Red first: something to fix outranks anything to count.
  if ((section.alert ?? 0) > 0) {
    return (
      <span
        aria-hidden
        className={cn(hidden, "absolute -top-1 -right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background")}
      />
    );
  }
  if (section.status) {
    const complete = section.status.done >= section.status.total;
    return (
      <span
        aria-hidden
        className={cn(
          hidden,
          "absolute -top-1 -right-1.5 size-2 rounded-full ring-2 ring-background",
          complete ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
    );
  }
  // Zero is shown too: an empty section says so rather than looking like one with no count.
  if (section.count !== undefined) {
    return (
      <span
        aria-hidden
        className={cn(
          hidden,
          "absolute -top-2 -right-2.5 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums ring-2 ring-background",
          section.count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {section.count > 99 ? "99+" : section.count}
      </span>
    );
  }
  return null;
}
