"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/**
 * How deep in forms this sheet is opened. 0 is a form opened on its own, which takes the whole
 * page; anything above is a form opened from inside another one — a client created while
 * filling in a project — which opens as a dialog in the middle of the screen, so the form it
 * came from stays visibly underneath and the person knows where they will land when it closes.
 *
 * Carried by context rather than a prop on every call site: React context crosses the portal,
 * so a sheet rendered anywhere inside another sheet's content knows it is nested without being
 * told.
 */
const SheetDepth = React.createContext(0)

/**
 * For a form that creates a reference on behalf of another form but is not rendered inside a
 * sheet — the client picker on the full-page invoice form. Wrapping it says "nested" where the
 * tree cannot.
 */
function NestedSheet({ children }: { children: React.ReactNode }) {
  const depth = React.useContext(SheetDepth)
  return <SheetDepth.Provider value={Math.max(depth, 1)}>{children}</SheetDepth.Provider>
}

/** A width the caller set for the old slide-over. Meaningless on a full page, so dropped there. */
const WIDTH_CLASS = /^(?:[a-z0-9-]+:)*(?:max-w|w)-/

function SheetContent({
  className,
  children,
  side = "right",
  layout,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  /**
   * "page" for a form on its own, "dialog" for one opened from another form, "panel" for a
   * slide-over that is not a form (the assistant). Worked out from the nesting when omitted.
   */
  layout?: "page" | "dialog" | "panel"
  showCloseButton?: boolean
}) {
  const depth = React.useContext(SheetDepth)

  // A sheet from the left or the top is chrome (the mobile menu), never a form.
  const resolved = side !== "right" ? "panel" : layout ?? (depth > 0 ? "dialog" : "page")

  const callerClasses =
    resolved === "page" && typeof className === "string"
      ? className.split(/\s+/).filter((token) => !WIDTH_CLASS.test(token)).join(" ")
      : className

  const layoutClasses = {
    // The whole viewport, with the header, the fields and the buttons held to one readable
    // column in the middle. The buttons sit in a row at the bottom right, as on a page form.
    // The scrolling body spans the full width and pads itself into the column instead, so its
    // scrollbar sits at the edge of the window rather than in the middle of the screen.
    page: "fixed inset-0 z-50 flex flex-col gap-0 bg-background text-sm text-foreground transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 [&>[data-slot=sheet-header]]:mx-auto [&>[data-slot=sheet-header]]:w-full [&>[data-slot=sheet-header]]:max-w-3xl [&>[data-slot=sheet-footer]]:mx-auto [&>[data-slot=sheet-footer]]:w-full [&>[data-slot=sheet-footer]]:max-w-3xl [&>*:not([data-slot])]:w-full [&>*:not([data-slot])]:px-[max(1rem,calc((100%-48rem)/2+1rem))] [&>[data-slot=sheet-header]]:pt-6 [&>[data-slot=sheet-header]]:pb-4 sm:[&>[data-slot=sheet-footer]]:flex-row-reverse sm:[&>[data-slot=sheet-footer]]:justify-start [&>[data-slot=sheet-footer]]:pb-6",
    // Centred, over the form it came from. Capped in height so a long one scrolls inside.
    dialog: "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-xl border border-border bg-popover text-sm text-popover-foreground shadow-lg transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:[&>[data-slot=sheet-footer]]:flex-row-reverse sm:[&>[data-slot=sheet-footer]]:justify-start",
    panel: "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
  }[resolved]

  return (
    <SheetPortal>
      {/* No dimming behind a full page: there is nothing left to see through it. */}
      {resolved !== "page" && <SheetOverlay />}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-layout={resolved}
        className={cn(layoutClasses, callerClasses)}
        {...props}
      >
        <SheetDepth.Provider value={depth + 1}>{children}</SheetDepth.Provider>
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Fermer</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  NestedSheet,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
