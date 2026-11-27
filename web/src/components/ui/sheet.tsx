"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { ArrowLeft, XIcon } from "lucide-react"

/**
 * Inline mode: the same form, drawn in the page instead of over it.
 *
 * A record's Détails section shows its form directly — the fields are already editable and one
 * Enregistrer saves them — rather than a read-only card with a Modifier that opens the very same
 * form on top. Rendering the existing form sheet inline keeps one form per record: the fields,
 * the validation and the save are not written twice and cannot drift apart.
 *
 * Three contexts, because an inline form can itself open real sheets (a client created from the
 * address picker) and those must not be inlined too:
 * - InlineRoot says the next Sheet down is the inline one; its content switches it off again.
 * - InlineContent says "inside the inline content", for the header, footer and close button;
 *   any ordinary sheet content switches it off for what it holds.
 * - InlineCancel is how Annuler puts the fields back to what was saved.
 */
const InlineRoot = React.createContext(false)
const InlineContent = React.createContext(false)
const InlineCancel = React.createContext<(() => void) | null>(null)

/**
 * Wraps a form sheet so it renders in place, always open. Annuler remounts the form, which is
 * what makes it read the saved record again — every form sheet already resets itself on mount.
 */
function InlineSheet({ children }: { children: React.ReactNode }) {
  const [generation, setGeneration] = React.useState(0)
  const cancel = React.useCallback(() => setGeneration((value) => value + 1), [])
  return (
    <InlineCancel.Provider value={cancel}>
      <InlineRoot.Provider value={true}>
        <React.Fragment key={generation}>{children}</React.Fragment>
      </InlineRoot.Provider>
    </InlineCancel.Provider>
  )
}

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  const inline = React.useContext(InlineRoot)
  const depth = React.useContext(SheetDepth)
  if (inline) return <>{props.children as React.ReactNode}</>
  // A form on its own page leaves the main menu usable beside it, so the person can still go
  // to another view: not modal at the first level. A form opened from a form stays modal.
  return <SheetPrimitive.Root data-slot="sheet" modal={props.modal ?? (depth === 0 ? false : true)} {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  const inline = React.useContext(InlineContent)
  const cancel = React.useContext(InlineCancel)
  if (inline && cancel) {
    // Closing means nothing on a form that is part of the page; what the button is for there is
    // throwing away what was typed.
    const children = props.children as React.ReactNode
    if (React.isValidElement(props.render)) {
      return React.cloneElement(props.render as React.ReactElement<Record<string, unknown>>, {
        onClick: cancel,
        children,
      })
    }
    return (
      <button type="button" onClick={cancel}>
        {children}
      </button>
    )
  }
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
  const inline = React.useContext(InlineRoot)

  if (inline) {
    const inlineClasses =
      typeof className === "string"
        ? className.split(/\s+/).filter((token) => !WIDTH_CLASS.test(token)).join(" ")
        : undefined
    return (
      <div
        data-slot="sheet-content"
        data-layout="inline"
        className={cn(
          "flex flex-col rounded-lg border border-border bg-card text-sm text-foreground [&>*:not([data-slot])]:flex-none [&>*:not([data-slot])]:overflow-visible [&>*:not([data-slot])]:px-4 [&>*:not([data-slot])]:pt-4 [&>[data-slot=sheet-footer]]:flex-row-reverse [&>[data-slot=sheet-footer]]:justify-start [&>[data-slot=sheet-footer]]:border-t [&>[data-slot=sheet-footer]]:border-border",
          inlineClasses
        )}
      >
        <InlineRoot.Provider value={false}>
          <InlineContent.Provider value={true}>
            <SheetDepth.Provider value={depth + 1}>{children as React.ReactNode}</SheetDepth.Provider>
          </InlineContent.Provider>
        </InlineRoot.Provider>
      </div>
    )
  }

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
    page: "fixed inset-0 z-50 md:left-16 md:border-l md:border-border flex flex-col gap-0 bg-background text-sm text-foreground transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 [&>[data-slot=sheet-header]]:mx-auto [&>[data-slot=sheet-header]]:w-full [&>[data-slot=sheet-header]]:max-w-3xl [&>[data-slot=sheet-footer]]:mx-auto [&>[data-slot=sheet-footer]]:w-full [&>[data-slot=sheet-footer]]:max-w-3xl [&>*:not([data-slot])]:w-full [&>*:not([data-slot])]:px-[max(1rem,calc((100%-48rem)/2+1rem))] [&>[data-slot=sheet-header]]:pt-6 [&>[data-slot=sheet-header]]:pb-4 sm:[&>[data-slot=sheet-footer]]:flex-row-reverse sm:[&>[data-slot=sheet-footer]]:justify-start [&>[data-slot=sheet-footer]]:pb-6",
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
        {/* A form on its own page reads like a page: a way back, at the top. */}
        {resolved === "page" && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4">
            <SheetPrimitive.Close
              render={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                />
              }
            >
              <ArrowLeft className="size-4" />
              Retour
            </SheetPrimitive.Close>
          </div>
        )}
        <InlineContent.Provider value={false}>
          <SheetDepth.Provider value={depth + 1}>{children}</SheetDepth.Provider>
        </InlineContent.Provider>
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
  // Inline, the section the form sits in already says what it is; "Modifier le client" above
  // fields that are simply there to be edited would be a title for a dialog that is not open.
  const inline = React.useContext(InlineContent)
  if (inline) return null
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
  InlineSheet,
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
