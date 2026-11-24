import type React from "react";

/**
 * Makes a card in a list open its record when pressed, the way ClickableRow does for a table
 * row — so that every list of related things answers a press on the line the same way, whether
 * it is drawn as a table or as cards.
 *
 * Spread onto the card element. A press on something inside that is interactive in its own
 * right (a link, a button, the actions menu, a field) means that thing and is left alone; the
 * card takes focus and answers Enter and Space, because a card that only answers the mouse is
 * unreachable by keyboard.
 */
export function rowOpenProps(onOpen: () => void, label: string) {
  function isInteractive(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest('a,button,input,select,textarea,label,[role="menuitem"],[role="menu"],[role="checkbox"]') !== null
    );
  }

  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    "data-row-open": "",
    onClick: (event: React.MouseEvent) => {
      if (isInteractive(event.target)) return;
      onOpen();
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target !== event.currentTarget) return;
      // Space scrolls the page otherwise, which is the opposite of opening the record.
      event.preventDefault();
      onOpen();
    },
  };
}

/** The look that goes with it: a pointer, a hover, and a focus ring a keyboard can follow. */
export const rowOpenClassName =
  "cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
