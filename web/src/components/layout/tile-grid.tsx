"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { applyOrder, useViewOrder } from "@/hooks/use-view-order";
import { cn } from "@/lib/utils";

export interface Tile {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  /** A destination; without one the tile calls onPick. */
  href?: string;
  /** A count in the corner. */
  badge?: number;
  /** A red dot: something needs looking at. */
  alert?: boolean;
}

/** How long a finger rests on a tile before the tiles start to move. */
const HOLD_MS = 500;
/** Further than this and the finger is scrolling, not holding. */
const MOVE_TOLERANCE = 10;

/**
 * Tiles three to a row, the way a phone shows its apps. Held for half a second, they start to
 * wiggle and can be dragged into another order; « Terminé » stops them. The order is kept per
 * person in this browser, under `orderId`.
 */
export function TileGrid({
  tiles,
  orderId,
  onPick,
  label,
}: {
  tiles: Tile[];
  orderId: string;
  /** A tile was chosen (also called for a tile with an href, before it navigates). */
  onPick?: (key: string, event: React.MouseEvent) => void;
  label: string;
}) {
  const { order, save } = useViewOrder(orderId, tiles.map((tile) => tile.key));
  const [editing, setEditing] = useState(false);
  // While dragging, the order being shown; saved when the finger lifts.
  const [live, setLive] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  // A long press ends in a click; that click must not open the tile.
  const swallowClick = useRef(false);

  const ordered = applyOrder(tiles, live ?? order, (tile) => tile.key);

  useEffect(() => () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
  }, []);

  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>, key: string) {
    if (editing) {
      // In edit mode the finger drags straight away.
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(key);
      setLive(ordered.map((tile) => tile.key));
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const { clientX: x, clientY: y } = event;
    hold.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        hold.current = null;
        swallowClick.current = true;
        setEditing(true);
        try {
          navigator.vibrate?.(15);
        } catch {
          // No vibration on this device.
        }
      }, HOLD_MS),
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (hold.current) {
      if (Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > MOVE_TOLERANCE) cancelHold();
      return;
    }
    if (!dragging || !live) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-tile-key]");
    const target = under?.dataset.tileKey;
    if (!target || target === dragging) return;
    const next = live.filter((key) => key !== dragging);
    next.splice(next.indexOf(target) + (live.indexOf(target) > live.indexOf(dragging) ? 1 : 0), 0, dragging);
    setLive(next);
  }

  function onPointerUp() {
    cancelHold();
    if (dragging && live) save(live);
    setDragging(null);
    setLive(null);
  }

  function onClick(event: React.MouseEvent, key: string) {
    if (swallowClick.current || editing) {
      event.preventDefault();
      swallowClick.current = false;
      return;
    }
    onPick?.(key, event);
  }

  return (
    <div>
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-muted-foreground">Glissez les tuiles pour les placer.</p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => save(null)}>
              Par défaut
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Terminé
            </Button>
          </div>
        </div>
      )}
      <nav aria-label={label} className="grid grid-cols-3 gap-2">
        {ordered.map((tile, index) => {
          const Icon = tile.icon;
          const className = cn(
            "relative flex min-h-24 select-none flex-col items-center justify-start gap-2 rounded-2xl p-2 pt-3 text-center [-webkit-touch-callout:none]",
            "transition-colors",
            tile.active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60 active:bg-sidebar-accent/60",
            editing && "touch-none motion-safe:animate-[vx-wiggle_0.3s_ease-in-out_infinite_alternate]",
            dragging === tile.key && "z-10 scale-110 opacity-80",
          );
          const body = (
            <>
              <span
                className={cn(
                  "relative flex size-12 shrink-0 items-center justify-center rounded-2xl",
                  tile.active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-6" />
                {tile.alert ? (
                  <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full bg-destructive ring-2 ring-sidebar" />
                ) : tile.badge !== undefined ? (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-2 min-w-5 rounded-full bg-primary px-1 text-[10px] leading-5 font-semibold tabular-nums text-primary-foreground ring-2 ring-sidebar"
                  >
                    {tile.badge > 99 ? "99+" : tile.badge}
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 text-xs leading-tight font-medium text-sidebar-foreground">{tile.label}</span>
            </>
          );
          const shared = {
            "data-tile-key": tile.key,
            onPointerDown: (event: React.PointerEvent<HTMLElement>) => onPointerDown(event, tile.key),
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
            // Alternate tiles start their wiggle the other way, as on a phone.
            style: editing ? { animationDelay: `${(index % 2) * -0.15}s` } : undefined,
            "aria-current": tile.active ? ("page" as const) : undefined,
            className,
          };

          return tile.href ? (
            <Link key={tile.key} href={tile.href} draggable={false} onClick={(event) => onClick(event, tile.key)} {...shared}>
              {body}
            </Link>
          ) : (
            <button key={tile.key} type="button" onClick={(event) => onClick(event, tile.key)} {...shared}>
              {body}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
