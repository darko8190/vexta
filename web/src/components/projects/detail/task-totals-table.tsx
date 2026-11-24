"use client";

import { useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectTaskTotalsQuery } from "@/hooks/use-project-tasks";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Hours as they read here: 8, or 8,25. Never 8,00. */
function hours(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(".", ",");
}

/**
 * What each task of a job cost and what it brought in.
 *
 * Folded away by default and fetched only when it is opened. It answers a question people ask
 * occasionally and deliberately — "which part of this job ate the margin" — and putting four
 * grouped reads behind every visit to the task list would make the list slower for everyone to
 * answer a question most of them did not ask.
 *
 * Every figure comes from the API, which computes it the same way the project's own cost table
 * does. Nothing is added up here: a second arithmetic over the same rows is how a breakdown
 * stops matching the total printed above it.
 */
export function TaskTotalsTable({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useProjectTaskTotalsQuery(projectId, open);

  return (
    <div className="rounded-lg border border-border">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between rounded-lg px-3 py-2"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Coins className="size-4" />
          Coût par tâche
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div className="border-t border-border p-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Rien n&apos;est encore attribué à une tâche. Les heures, les matériaux, les dépenses
              et les frais portent chacun un champ <strong>Tâche</strong> — ce qui y est rattaché
              apparaît ici.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Tâche</th>
                    <th className="pb-2 text-right font-medium">Heures</th>
                    <th className="pb-2 text-right font-medium">Coût</th>
                    <th className="pb-2 text-right font-medium">Vendant</th>
                    <th className="pb-2 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={row.taskId ?? "non-attribue"}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "text-foreground",
                            // The loose row is not a task and does not pretend to be one.
                            row.taskId === null && "italic text-muted-foreground",
                          )}
                        >
                          {row.title}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {row.hours === 0 ? "—" : hours(row.hours)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {formatAmount(row.cost)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatAmount(row.revenue)}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-medium tabular-nums",
                          // Red only when the task actually lost money. Zero is not a loss, and
                          // a job with nothing costed yet should not read as one.
                          row.profit < 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {formatAmount(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-3 text-xs text-muted-foreground">
                Les heures sont comptées au taux horaire de l&apos;entreprise, et comme un
                vendant seulement : ce qu&apos;une heure vous coûte, c&apos;est la paie, et Vexta
                ne la connaît pas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
