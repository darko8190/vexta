"use client";

import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeamQuery } from "@/hooks/use-team";

/**
 * Several employees at once, for narrowing a list of hours. Nobody picked means everybody: the
 * filter only ever takes away.
 */
export function EmployeeMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { data: team } = useTeamQuery();
  const employees = [...(team?.employees ?? [])].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr-CA"),
  );

  const label =
    value.length === 0
      ? "Tous les employés"
      : value.length === 1
        ? (() => {
            const one = employees.find((employee) => employee.id === value[0]);
            return one ? `${one.firstName} ${one.lastName}` : "1 employé";
          })()
        : `${value.length} employés`;

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((item) => item !== id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="justify-between gap-2" />}>
        <Users />
        <span className="truncate">{label}</span>
        <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {value.length > 0 && (
          <>
            <DropdownMenuItem onClick={() => onChange([])}>Tous les employés</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {employees.map((employee) => (
          <DropdownMenuCheckboxItem
            key={employee.id}
            checked={value.includes(employee.id)}
            closeOnClick={false}
            onCheckedChange={(checked) => toggle(employee.id, Boolean(checked))}
          >
            {employee.firstName} {employee.lastName}
          </DropdownMenuCheckboxItem>
        ))}
        {employees.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucun employé.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
