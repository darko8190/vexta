"use client";

import { useState } from "react";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { useReorderModules } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import { moduleIcon } from "@/lib/module-icons";
import type { ModuleRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The modules, in the order they appear in every company's sidebar, rearranged by dragging.
 *
 * The list is seeded once at mount and the page gives this component a key that changes when
 * the server's order changes. Nothing re-reads the props afterwards: a background refetch that
 * returns the same arrangement must not yank a row out from under somebody mid-drag.
 *
 * Dragging is not the only way to move a row. A pointer is not something every admin has on
 * every device, and a list that can only be rearranged by dragging is a list some people cannot
 * rearrange at all — so the handle takes focus and answers the arrow keys.
 */
export function ModulesTable({
  modules,
  onEdit,
  onDelete,
}: {
  modules: ModuleRecord[];
  onEdit: (module: ModuleRecord) => void;
  onDelete: (module: ModuleRecord) => void;
}) {
  const reorder = useReorderModules();

  const [order, setOrder] = useState<ModuleRecord[]>(() => modules);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  /** Moves one row to another's position and saves the whole sequence. */
  function moveTo(fromId: string, toId: string) {
    if (fromId === toId) return;

    const next = [...order];
    const from = next.findIndex((m) => m.id === fromId);
    const to = next.findIndex((m) => m.id === toId);
    if (from < 0 || to < 0) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setOrder(next);
    save(next);
  }

  function moveBy(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];

    setOrder(next);
    save(next);
  }

  async function save(next: ModuleRecord[]) {
    try {
      await reorder.mutateAsync(next.map((m) => m.id));
    } catch (error) {
      // The rows stay where they were dropped rather than snapping back: the refetch that
      // follows will restore the server's truth, and a list that jumps while somebody reads
      // the error message is a list nobody trusts.
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer l'ordre.");
    }
  }

  const titles = new Map(order.map((m) => [m.id, m.title]));

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Glissez une ligne par sa poignée pour changer l&apos;ordre du menu. Au clavier :
        concentrez la poignée et utilisez les flèches haut et bas.
      </p>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-12">Icône</TableHead>
              <TableHead>Titre</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Onglet</TableHead>
              <TableHead className="w-28">Statut</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.map((module, index) => {
              const Icon = moduleIcon(module.icon);

              return (
                <ClickableRow
                  key={module.id}
                  label={`Modifier ${module.title}`}
                  onOpen={() => onEdit(module)}
                  className={cn(
                    dragging === module.id && "opacity-50",
                    // A line above the row being hovered, so the drop lands where the eye
                    // expects rather than wherever the browser decides.
                    over === module.id && dragging !== module.id && "border-t-2 border-t-primary",
                  )}
                  onDragOver={(event) => {
                    if (!dragging) return;
                    event.preventDefault();
                    setOver(module.id);
                  }}
                  onDragLeave={() => setOver((current) => (current === module.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) moveTo(dragging, module.id);
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  <TableCell>
                    {/* A button, not a bare cell: it takes focus for the keyboard, and the row
                        leaves anything inside a button alone rather than opening the record. */}
                    <button
                      type="button"
                      draggable
                      aria-label={`Déplacer ${module.title}`}
                      className={cn(
                        "flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground",
                        "transition-colors duration-150 motion-reduce:transition-none",
                        "hover:bg-accent hover:text-foreground active:cursor-grabbing",
                        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      )}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        // Firefox refuses to start a drag without something on the clipboard.
                        event.dataTransfer.setData("text/plain", module.id);
                        setDragging(module.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          moveBy(index, -1);
                        }
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          moveBy(index, 1);
                        }
                      }}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  </TableCell>

                  <TableCell>
                    <Icon className="size-4 text-muted-foreground" />
                  </TableCell>

                  <TableCell className="font-medium">
                    {/* Children are indented so the list reads as the menu it describes. */}
                    <span className={module.parentModuleId ? "pl-4" : undefined}>{module.title}</span>
                  </TableCell>

                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {module.description}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {module.navHref ? (
                      <span className="flex flex-col">
                        <span className="font-mono text-xs">{module.navHref}</span>
                        <span className="text-xs">
                          {module.parentModuleId
                            ? `Sous-onglet de ${titles.get(module.parentModuleId) ?? "—"}`
                            : "Onglet principal"}
                          {module.ownerOnly ? " · propriétaire" : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs">Aucun écran</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={module.isPublished ? "default" : "outline"}>
                      {module.isPublished ? "Publié" : "Masqué"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(module)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete(module)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
