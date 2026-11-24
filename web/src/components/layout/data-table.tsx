"use client";

import { useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Columns3, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClickableRow } from "@/components/layout/clickable-row";
import { useTableLayout } from "@/hooks/use-table-layout";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface DataColumnEdit<T> {
  type: "text" | "number" | "date" | "select";
  /** The stored value as the editor shows it. */
  value: (row: T) => string;
  options?: { value: string; label: string }[];
}

export interface DataColumn<T> {
  key: string;
  label: string;
  cell: (row: T) => React.ReactNode;
  headClassName?: string;
  cellClassName?: string;
  /** Off until somebody turns it on in Colonnes. */
  hiddenByDefault?: boolean;
  /** The column that identifies the row; it cannot be hidden. */
  locked?: boolean;
  /** Editable in the table's edit mode. */
  edit?: DataColumnEdit<T>;
}

type RowState = "idle" | "saving" | "saved" | "error";

/**
 * A list as a table, with what a spreadsheet user expects of one.
 *
 * - Colonnes: show, hide and reorder the columns. Remembered per table, in this browser.
 * - Modifier: every editable cell becomes a field, row by row. A row saves itself when focus
 *   leaves it with something changed — the way a spreadsheet commits a line — and Échap puts the
 *   row back. Outside edit mode a press on a row opens its record, as everywhere else.
 */
export function DataTable<T>({
  id,
  columns,
  rows,
  getRowId,
  rowLabel,
  onOpen,
  onSaveRow,
  actions,
  toolbarStart,
}: {
  /** Names the stored column layout. */
  id: string;
  columns: DataColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  rowLabel: (row: T) => string;
  onOpen?: (row: T) => void;
  /** Saves one edited row; given only the fields that changed. Omitted: no edit mode. */
  onSaveRow?: (row: T, changes: Record<string, string>) => Promise<void>;
  /** The last cell of each row, outside edit mode: the row's menu. */
  actions?: (row: T) => React.ReactNode;
  /** What sits at the left of the toolbar, usually the search. */
  toolbarStart?: React.ReactNode;
}) {
  const { layout, save } = useTableLayout(
    id,
    columns.map((column) => column.key),
    columns.filter((column) => column.hiddenByDefault).map((column) => column.key),
  );
  const [editing, setEditing] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const byKey = new Map(columns.map((column) => [column.key, column]));
  const visible = layout.order
    .map((key) => byKey.get(key)!)
    .filter((column) => column && (column.locked || !layout.hidden.includes(column.key)));
  const canEdit = Boolean(onSaveRow) && columns.some((column) => column.edit);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{toolbarStart}</div>
        {canEdit && (
          <Button variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>
            {editing ? <Check /> : <Pencil />}
            {editing ? "Terminer" : "Modifier"}
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon" aria-label="Colonnes" onClick={() => setColumnsOpen(true)} />
            }
          >
            <Columns3 />
          </TooltipTrigger>
          <TooltipContent>Colonnes</TooltipContent>
        </Tooltip>
      </div>

      {editing && (
        <p className="mb-2 text-xs text-muted-foreground">
          Chaque ligne s&apos;enregistre quand vous la quittez. Échap annule les changements de la ligne.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {visible.map((column) => (
                <TableHead key={column.key} className={column.headClassName}>
                  {column.label}
                </TableHead>
              ))}
              {(actions || editing) && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) =>
              editing ? (
                <EditableRow
                  key={getRowId(row)}
                  row={row}
                  columns={visible}
                  onSave={(changes) => onSaveRow!(row, changes)}
                />
              ) : onOpen ? (
                <ClickableRow key={getRowId(row)} label={rowLabel(row)} onOpen={() => onOpen(row)}>
                  {visible.map((column) => (
                    <TableCell key={column.key} className={column.cellClassName}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {actions && <TableCell>{actions(row)}</TableCell>}
                </ClickableRow>
              ) : (
                <TableRow key={getRowId(row)}>
                  {visible.map((column) => (
                    <TableCell key={column.key} className={column.cellClassName}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {actions && <TableCell>{actions(row)}</TableCell>}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>

      <ColumnsDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        columns={columns}
        order={layout.order}
        hidden={layout.hidden}
        onChange={(order, hidden) => save({ order, hidden })}
        onReset={() => save(null)}
      />
    </div>
  );
}

function EditableRow<T>({
  row,
  columns,
  onSave,
}: {
  row: T;
  columns: DataColumn<T>[];
  onSave: (changes: Record<string, string>) => Promise<void>;
}) {
  const initial = () =>
    Object.fromEntries(columns.filter((c) => c.edit).map((c) => [c.key, c.edit!.value(row)]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [state, setState] = useState<RowState>("idle");
  const rowRef = useRef<HTMLTableRowElement>(null);

  function changes() {
    const stored = initial();
    return Object.fromEntries(Object.entries(draft).filter(([key, value]) => stored[key] !== value));
  }

  async function commit() {
    const changed = changes();
    if (Object.keys(changed).length === 0) return;
    setState("saving");
    try {
      await onSave(changed);
      setState("saved");
    } catch (error) {
      setState("error");
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette ligne.");
    }
  }

  return (
    <TableRow
      ref={rowRef}
      className={cn(state === "error" && "bg-destructive/5")}
      onBlur={(event) => {
        // Only when focus leaves the row altogether: moving between its own cells is editing.
        if (rowRef.current?.contains(event.relatedTarget as Node | null)) return;
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(initial());
          setState("idle");
        }
        if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
          event.preventDefault();
          // Down to the same column on the next row, as in a spreadsheet.
          const cell = (event.target as HTMLElement).closest("td");
          const index = cell ? Array.from(cell.parentElement!.children).indexOf(cell) : -1;
          const next = rowRef.current?.nextElementSibling?.children[index]?.querySelector<HTMLElement>("input,select");
          if (next) next.focus();
          else (event.target as HTMLElement).blur();
        }
      }}
    >
      {columns.map((column) => (
        <TableCell key={column.key} className={cn(column.cellClassName, column.edit && "py-1")}>
          {column.edit ? (
            column.edit.type === "select" ? (
              <select
                aria-label={column.label}
                value={draft[column.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [column.key]: event.target.value }))}
                className="h-8 w-full min-w-28 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {column.edit.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                aria-label={column.label}
                type={column.edit.type}
                step={column.edit.type === "number" ? "0.01" : undefined}
                value={draft[column.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [column.key]: event.target.value }))}
                className="h-8 min-w-28"
              />
            )
          ) : (
            column.cell(row)
          )}
        </TableCell>
      ))}
      <TableCell className="w-10">
        {state === "saving" && <Spinner />}
        {state === "saved" && <Check className="size-4 text-muted-foreground" aria-label="Enregistrée" />}
        {state === "error" && <AlertCircle className="size-4 text-destructive" aria-label="Non enregistrée" />}
      </TableCell>
    </TableRow>
  );
}

function ColumnsDialog<T>({
  open,
  onOpenChange,
  columns,
  order,
  hidden,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: DataColumn<T>[];
  order: string[];
  hidden: string[];
  onChange: (order: string[], hidden: string[]) => void;
  onReset: () => void;
}) {
  const byKey = new Map(columns.map((column) => [column.key, column]));

  function move(index: number, by: number) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next, hidden);
  }

  function toggle(key: string, shown: boolean) {
    onChange(order, shown ? hidden.filter((item) => item !== key) : [...hidden, key]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonnes</DialogTitle>
          <DialogDescription>Choisissez les colonnes affichées et leur ordre.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1">
          {order.map((key, index) => {
            const column = byKey.get(key);
            if (!column) return null;
            const shown = column.locked || !hidden.includes(key);
            return (
              <li key={key} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                <Checkbox
                  id={`column-${key}`}
                  checked={shown}
                  disabled={column.locked}
                  onCheckedChange={(checked) => toggle(key, checked === true)}
                />
                <label htmlFor={`column-${key}`} className="flex-1 text-sm">
                  {column.label}
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Monter ${column.label}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descendre ${column.label}`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onReset}>
            Réinitialiser
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
