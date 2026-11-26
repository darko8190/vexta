"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { nextSort, type SortState } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

/**
 * A table heading that sorts: pressed once ascending, again descending. The arrow says which
 * way the column is sorted; the faint double arrow says a column can be.
 */
export function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState | null | undefined;
  onSort: (sort: SortState) => void;
  className?: string;
}) {
  const current = sort?.key === sortKey ? sort.dir : null;
  const Icon = current === "asc" ? ArrowUp : current === "desc" ? ArrowDown : ArrowUpDown;
  const alignRight = className?.includes("text-right");

  return (
    <TableHead
      className={className}
      aria-sort={current === "asc" ? "ascending" : current === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, sortKey))}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          alignRight && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("size-3.5 shrink-0", current ? "text-foreground" : "text-muted-foreground/50")} />
      </button>
    </TableHead>
  );
}
