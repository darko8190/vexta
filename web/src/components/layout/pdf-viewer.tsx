"use client";

import { useRef } from "react";
import { Download, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A PDF the API produced, in a viewer, with the two things anyone does with a document: print
 * it and keep a copy.
 *
 * It shows the document itself rather than a drawing of it in HTML. A preview that is a second
 * implementation of the layout is a preview that can be wrong about the document it claims to
 * show — and the moments this is useful are the moment before an invoice is sent and the
 * moment before a CV is.
 */
export function PdfViewer({
  url,
  loading,
  error,
  fileName,
  title = "Facture",
  className,
}: {
  url: string | null;
  loading: boolean;
  error: string | null;
  fileName: string;
  title?: string;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);

  function print() {
    if (!url) return;

    // The frame holds a blob this page created, so it is same-origin and can be printed in
    // place. Some browsers still refuse from inside a frame; opening the document in a tab is
    // the same document, one step further away.
    try {
      const view = frame.current?.contentWindow;
      if (view) {
        view.focus();
        view.print();
        return;
      }
    } catch {
      // Falls through to the tab.
    }

    window.open(url, "_blank", "noopener")?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="flex items-center gap-1">
          {/* An anchor rather than a Button rendering one: the download attribute is what
              saves the file, and Base UI warns when a button is rendered as something else. */}
          {url && (
            <a href={url} download={fileName} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              <Download />
              Télécharger
            </a>
          )}
          <Button variant="outline" size="sm" onClick={print} disabled={!url}>
            <Printer />
            Imprimer
          </Button>
        </div>
      </div>

      <div className="relative aspect-[17/22] overflow-hidden rounded-lg border border-border bg-muted">
        {url ? (
          // The viewer's own toolbar is hidden: it repeats the two buttons above it, in a
          // panel narrow enough that the document itself was losing the room. FitH so the
          // page fills the width it has.
          <iframe
            ref={frame}
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            title={title}
            className="size-full border-0"
          />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {error ?? "Le document apparaîtra ici."}
          </div>
        )}

        {/* Over the document rather than instead of it: the previous page stays readable while
            the next one is being made. */}
        {loading && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-background/90 p-2 shadow-sm">
            <Spinner className="size-4" />
          </div>
        )}

        {error && url && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
