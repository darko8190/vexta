"use client";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A table row that opens the record when you press it.
 *
 * Two things it has to get right. A row holds its own links and its own actions menu, and a
 * click on one of those means that thing, not the row — so anything inside an <a>, a <button>
 * or a menu is left alone. And a row that only answers the mouse is unreachable by keyboard,
 * so it takes focus and answers Enter and Space like the button it now is.
 */
export function ClickableRow({
  onOpen,
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"tr"> & { onOpen: () => void; label: string }) {
  function isInteractive(target: EventTarget | null) {
    return target instanceof Element && target.closest('a,button,input,[role="checkbox"],[role="menuitem"],[role="menu"]') !== null;
  }

  return (
    <TableRow
      {...props}
      role="button"
      tabIndex={0}
      aria-label={label}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if (isInteractive(event.target)) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (isInteractive(event.target)) return;
        // Space scrolls the page otherwise, which is the opposite of opening the record.
        event.preventDefault();
        onOpen();
      }}
    >
      {children}
    </TableRow>
  );
}
