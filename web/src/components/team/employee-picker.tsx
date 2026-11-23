"use client";

import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { useTeamQuery } from "@/hooks/use-team";
import { userRoleLabels } from "@/lib/labels";
import type { Employee } from "@/lib/types";

function fullName(employee: Employee): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** What distinguishes two people with similar names: the job title, or failing that the role. */
function subtitle(employee: Employee): string {
  return employee.jobTitle?.trim() || userRoleLabels[employee.role];
}

/**
 * Picks one employee by typing their name.
 *
 * A dropdown is fine for six people and unusable for sixty, which is what a contractor has by
 * the second summer: scrolling a list to find "Tremblay" when you know you want Tremblay is
 * work the keyboard should be doing. Searches the job title too, because "le plombier" is
 * sometimes all anybody remembers.
 */
export function EmployeePicker({
  value,
  onChange,
  id,
  invalid,
  placeholder = "Rechercher un employé…",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { data: team, isLoading } = useTeamQuery();
  // Null while nothing has been typed, so the field can show the person it already points at.
  const [typed, setTyped] = useState<string | null>(null);

  const employees = useMemo(() => team?.employees ?? [], [team]);
  const selected = useMemo(
    () => employees.find((employee) => employee.id === value) ?? null,
    [employees, value],
  );

  const matches = useMemo(() => {
    const needle = (typed ?? "").trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      `${fullName(employee)} ${employee.jobTitle ?? ""} ${employee.email}`.toLowerCase().includes(needle),
    );
  }, [employees, typed]);

  return (
    <Combobox
      items={matches}
      value={selected}
      inputValue={typed ?? (selected ? fullName(selected) : "")}
      onInputValueChange={setTyped}
      onValueChange={(next) => {
        const picked = next as Employee | null;
        onChange(picked?.id ?? "");
        setTyped(picked ? fullName(picked) : "");
      }}
      itemToStringLabel={(employee: Employee) => fullName(employee)}
    >
      <div className="relative">
        <ComboboxInput
          id={id}
          aria-invalid={invalid}
          placeholder={isLoading ? "Chargement…" : placeholder}
        />
        <ComboboxTrigger />
      </div>

      <ComboboxContent>
        <ComboboxEmpty>
          {employees.length === 0
            ? "Personne sur la paie pour l'instant."
            : "Personne ne correspond."}
        </ComboboxEmpty>
        <ComboboxList>
          {(employee: Employee) => (
            <ComboboxItem key={employee.id} value={employee}>
              <span className="truncate font-medium">{fullName(employee)}</span>
              <span className="truncate text-xs text-muted-foreground">{subtitle(employee)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
