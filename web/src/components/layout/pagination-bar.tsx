"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PagedResult } from "@/lib/types";

export function PaginationBar<T>({
  result,
  onPageChange,
}: {
  result: PagedResult<T> | undefined;
  onPageChange: (page: number) => void;
}) {
  if (!result || result.totalCount === 0) return null;

  const start = (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.totalCount);

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {start}–{end} sur {result.totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Page précédente"
          disabled={result.page <= 1}
          onClick={() => onPageChange(result.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {result.page} / {Math.max(result.totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Page suivante"
          disabled={result.page >= result.totalPages}
          onClick={() => onPageChange(result.page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
