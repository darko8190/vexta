"use client";

import { cn } from "@/lib/utils";

/**
 * A card that opens its record when you press it.
 *
 * The same contract as <ClickableRow>, for lists drawn as cards rather than as table rows. A
 * card holds its own buttons and links — "Remplir", an actions menu — and a press on one of
 * those means that thing, not the card, so anything interactive inside is left alone. And a
 * card that only answers the mouse is unreachable by keyboard, so it takes focus and answers
 * Enter and Space like the button it now is.
 */
export function ClickableCard({
  onOpen,
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { onOpen: () => void; label: string }) {
  function isInteractive(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest('a,button,input,textarea,select,[role="menuitem"],[role="menu"]') !== null
    );
  }

  return (
    <div
      {...props}
      role="button"
      tabIndex={0}
      aria-label={label}
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
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
    </div>
  );
}
