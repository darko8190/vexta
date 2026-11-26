"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cleanFilters, type ColumnFilterType, type ColumnFilterValue, type TableFilters } from "@/lib/table-filters";

export interface FilterableColumn {
  key: string;
  label: string;
  type: ColumnFilterType;
  options?: { value: string; label: string }[];
}

/**
 * One field per column of the view, of the column's kind. Applied with one button rather than
 * on every keystroke: a range is two numbers, and the list should not reload between them.
 */
export function TableFiltersSheet({
  open,
  onOpenChange,
  columns,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: FilterableColumn[];
  filters: TableFilters;
  onApply: (filters: TableFilters) => void;
}) {
  // A copy while the panel is open; the list keeps its filters until Appliquer.
  const [draft, setDraft] = useState<TableFilters>(filters);

  function set(key: string, value: ColumnFilterValue) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(filters);
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filtres</SheetTitle>
          <SheetDescription>Selon les colonnes affichées. Laissez vide pour ne pas filtrer.</SheetDescription>
        </SheetHeader>

        <form
          id="table-filters"
          className="flex-1 space-y-5 overflow-y-auto px-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(cleanFilters(draft));
            onOpenChange(false);
          }}
        >
          {columns.map((column) => (
            <FilterField
              key={column.key}
              column={column}
              value={draft[column.key] ?? {}}
              onChange={(value) => set(column.key, value)}
            />
          ))}
        </form>

        <SheetFooter>
          <Button type="submit" form="table-filters">
            Appliquer
          </Button>
          <Button type="button" variant="outline" onClick={() => setDraft({})}>
            Tout effacer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterField({
  column,
  value,
  onChange,
}: {
  column: FilterableColumn;
  value: ColumnFilterValue;
  onChange: (value: ColumnFilterValue) => void;
}) {
  const id = `filter-${column.key}`;

  if (column.type === "number" || column.type === "date") {
    const isDate = column.type === "date";
    return (
      <Field>
        <FieldLabel htmlFor={`${id}-a`}>{column.label}</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <Input
            id={`${id}-a`}
            type={isDate ? "date" : "text"}
            inputMode={isDate ? undefined : "decimal"}
            aria-label={`${column.label}, ${isDate ? "du" : "minimum"}`}
            placeholder={isDate ? undefined : "Min."}
            value={(isDate ? value.from : value.min) ?? ""}
            onChange={(event) => onChange(isDate ? { from: event.target.value } : { min: event.target.value })}
          />
          <Input
            type={isDate ? "date" : "text"}
            inputMode={isDate ? undefined : "decimal"}
            aria-label={`${column.label}, ${isDate ? "au" : "maximum"}`}
            placeholder={isDate ? undefined : "Max."}
            value={(isDate ? value.to : value.max) ?? ""}
            onChange={(event) => onChange(isDate ? { to: event.target.value } : { max: event.target.value })}
          />
        </div>
      </Field>
    );
  }

  if (column.type === "select") {
    return <MultiSelectFilter column={column} value={value.values ?? []} onChange={(values) => onChange({ values })} />;
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{column.label}</FieldLabel>
      <Input
        id={id}
        placeholder="Contient…"
        value={value.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </Field>
  );
}

/** A list of boxes to tick, with a search above it once the list is long enough to need one. */
function MultiSelectFilter({
  column,
  value,
  onChange,
}: {
  column: FilterableColumn;
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const options = useMemo(() => column.options ?? [], [column.options]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, search]);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-foreground">
        {column.label}
        {value.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({value.length})</span>}
      </legend>
      {options.length > 8 && (
        <Input
          aria-label={`Rechercher dans ${column.label}`}
          placeholder="Rechercher…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {shown.length === 0 && <li className="px-1 py-1 text-sm text-muted-foreground">Aucun choix.</li>}
        {shown.map((option) => {
          const checked = value.includes(option.value);
          const optionId = `filter-${column.key}-${option.value}`;
          return (
            <li key={option.value} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
              <Checkbox
                id={optionId}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next === true ? [...value, option.value] : value.filter((v) => v !== option.value))
                }
              />
              <label htmlFor={optionId} className="flex-1 text-sm">
                {option.label}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
