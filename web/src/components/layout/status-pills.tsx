"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface StatusCount {
  status: string;
  count: number;
}

/**
 * Counts per state for a list, under the list's own query key so every write that refreshes
 * the list refreshes the pills with it.
 */
export function useStatusCountsQuery(rootKey: string, path: string, enabled = true) {
  return useQuery({
    queryKey: [rootKey, "statuts"],
    queryFn: () => api.get<StatusCount[]>(path),
    enabled,
  });
}

/**
 * The states of a list as a row of pills above it, each with how many records it holds: one
 * press filters the list, and the counts say where the work is before anything is opened.
 * Scrolls sideways on a phone rather than wrapping into a block that pushes the list down.
 */
export function StatusPills<T extends string>({
  options,
  value,
  onChange,
  counts,
  allLabel = "Tous",
  label = "Filtrer par état",
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (value: T | "") => void;
  counts?: StatusCount[];
  allLabel?: string;
  label?: string;
}) {
  const countOf = (status: string) => counts?.find((c) => c.status === status)?.count ?? 0;
  const total = counts?.filter((c) => options.some((o) => o.value === c.status)).reduce((sum, c) => sum + c.count, 0);

  const pill = (key: string, text: string, active: boolean, count: number | undefined, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {text}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-xs tabular-nums",
            active ? "bg-primary-foreground/20" : "bg-muted text-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div role="group" aria-label={label} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {pill("", allLabel, value === "", counts ? total : undefined, () => onChange(""))}
      {options.map((option) =>
        pill(option.value, option.label, value === option.value, counts ? countOf(option.value) : undefined, () =>
          onChange(option.value),
        ),
      )}
    </div>
  );
}
