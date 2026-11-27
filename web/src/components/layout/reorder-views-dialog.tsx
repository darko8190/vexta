"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ReorderItem {
  key: string;
  label: string;
}

/** Put the views of a screen in the order this person wants, with arrows rather than dragging. */
export function ReorderViewsDialog({
  open,
  onOpenChange,
  items,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReorderItem[];
  onSave: (keys: string[]) => void;
  onReset: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* Remounted at each opening, so it starts from the order in use. */}
        {open && <ReorderList items={items} onSave={onSave} onReset={onReset} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReorderList({
  items,
  onSave,
  onReset,
  onClose,
}: {
  items: ReorderItem[];
  onSave: (keys: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(items);

  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setList(next);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ordre des vues</DialogTitle>
        <DialogDescription>L&apos;ordre est gardé pour vous, sur cet appareil.</DialogDescription>
      </DialogHeader>
      <ol className="grid gap-1">
        {list.map((item, index) => (
          <li key={item.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
            <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Monter ${item.label}`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Descendre ${item.label}`}
              disabled={index === list.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
          </li>
        ))}
      </ol>
      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            onReset();
            onClose();
          }}
        >
          Ordre d&apos;origine
        </Button>
        <Button
          onClick={() => {
            onSave(list.map((item) => item.key));
            onClose();
          }}
        >
          Enregistrer l&apos;ordre
        </Button>
      </DialogFooter>
    </>
  );
}
