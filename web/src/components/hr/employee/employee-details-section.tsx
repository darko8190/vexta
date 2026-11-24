"use client";

import { InlineSheet } from "@/components/ui/sheet";
import { EmployeeFormSheet } from "@/components/team/employee-form-sheet";
import type { Employee } from "@/lib/types";

/**
 * The employee's own fields, editable where they are read — the same shape as a client's
 * Détails. Change a field, press Enregistrer; Annuler puts back what was saved. The read-only
 * card with a Modifier on top of it was two steps for a one-field change.
 */
export function EmployeeDetailsSection({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Détails</h2>
        <p className="text-sm text-muted-foreground">
          Modifiez les champs directement, puis enregistrez.
        </p>
      </div>
      <InlineSheet>
        <EmployeeFormSheet open onOpenChange={() => {}} employee={employee} />
      </InlineSheet>
    </div>
  );
}
