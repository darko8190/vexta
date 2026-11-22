"use client";

import { useEffect, useRef, useState } from "react";

export interface PdfDocumentState {
  /** An object URL for the PDF, or null until one has been fetched. */
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a PDF through the API proxy and hands back an object URL a viewer can open.
 *
 * The body is passed already serialised, which is deliberate: it is what the effect depends
 * on, so a preview that is being typed into re-renders only when the document would actually
 * come out different. The previous URL is revoked as the next one replaces it — a preview
 * refreshed on every keystroke would otherwise leak a blob per keystroke.
 *
 * The old document stays on screen while a new one is fetched, and an error does not clear
 * it. Blanking the page between keystrokes would make the preview unreadable exactly while it
 * is being used.
 */
export function usePdfDocument(path: string | null, bodyJson?: string): PdfDocumentState {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!path) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const response = await fetch(`/api/proxy/${path}`, {
          method: bodyJson === undefined ? "GET" : "POST",
          headers: bodyJson === undefined ? undefined : { "Content-Type": "application/json" },
          body: bodyJson,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          let message = "Impossible de produire le document.";
          try {
            message = (JSON.parse(text) as { message?: string }).message ?? message;
          } catch {
            // A failure that is not JSON has nothing to quote; the default says enough.
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        if (cancelled) return;

        const next = URL.createObjectURL(blob);
        if (current.current) URL.revokeObjectURL(current.current);
        current.current = next;

        setUrl(next);
        setError(null);
      } catch (thrown) {
        if (cancelled || (thrown as Error).name === "AbortError") return;
        setError((thrown as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, bodyJson]);

  // Nothing left behind when the page does.
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [],
  );

  return { url, loading, error };
}
