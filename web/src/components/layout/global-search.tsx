"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardPen,
  FileText,
  FolderKanban,
  Package,
  Search,
  Truck,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const kinds: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  client: { label: "Clients", icon: Users },
  projet: { label: "Projets", icon: FolderKanban },
  soumission: { label: "Soumissions", icon: ClipboardPen },
  facture: { label: "Factures", icon: FileText },
  produit: { label: "Produits", icon: Package },
  equipement: { label: "Équipements", icon: Wrench },
  fournisseur: { label: "Fournisseurs", icon: Truck },
  employe: { label: "Employés", icon: UserRound },
};

/**
 * The search in the top bar: anything of the company's, from anywhere. Ctrl K (⌘ K) opens it,
 * the arrows move through the results and Entrée opens one.
 */
export function GlobalSearch({ shortcut = true }: { shortcut?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const debounced = useDebouncedValue(text.trim(), 250);
  const listRef = useRef<HTMLDivElement>(null);

  // Staff of a company only: a customer, a personal space and the platform admin have nothing
  // of a company's to look through.
  const allowed =
    Boolean(user) &&
    user!.role !== "Client" &&
    user!.tenantKind !== "Personal" &&
    (user!.role !== "SuperAdmin" || user!.isImpersonating);

  const { data, isFetching } = useQuery({
    queryKey: ["recherche", debounced],
    queryFn: () => api.get<SearchHit[]>(`recherche?q=${encodeURIComponent(debounced)}`),
    enabled: allowed && open && debounced.length >= 2,
    placeholderData: (previous) => previous,
  });

  const hits = debounced.length >= 2 ? (data ?? []) : [];

  useEffect(() => {
    // One listener for the page: the bar is drawn twice (phone and desktop), and both opening
    // on the same keystroke would stack two dialogs.
    if (!allowed || !shortcut) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, shortcut]);

  if (!allowed) return null;

  function go(hit: SearchHit) {
    setOpen(false);
    setText("");
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((value) => Math.min(value + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter" && hits[index]) {
      event.preventDefault();
      go(hits[index]);
    }
  }

  // Grouped by kind, in the order the API sends them.
  const groups: { type: string; items: { hit: SearchHit; position: number }[] }[] = [];
  hits.forEach((hit, position) => {
    const group = groups.find((item) => item.type === hit.type);
    if (group) group.items.push({ hit, position });
    else groups.push({ type: hit.type, items: [{ hit, position }] });
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground",
          "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "w-9 justify-center px-0 sm:w-56 sm:justify-start sm:px-3 lg:w-72",
        )}
        aria-label="Rechercher dans l'entreprise"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left sm:inline">Rechercher…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setText("");
        }}
      >
        <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Recherche globale</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Client, projet, facture, produit, employé…"
              aria-label="Rechercher"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching && <Spinner className="size-4" />}
          </div>

          <div ref={listRef} className="max-h-[60dvh] overflow-y-auto p-2">
            {debounced.length < 2 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Tapez au moins deux caractères pour chercher dans toute l&apos;entreprise.
              </p>
            ) : hits.length === 0 && !isFetching ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Aucun résultat pour « {debounced} ».</p>
            ) : (
              groups.map((group) => {
                const kind = kinds[group.type] ?? { label: group.type, icon: Building2 };
                const Icon = kind.icon;
                return (
                  <div key={group.type} className="mb-2">
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{kind.label}</p>
                    {group.items.map(({ hit, position }) => (
                      <button
                        key={`${hit.type}-${hit.id}`}
                        type="button"
                        onMouseEnter={() => setIndex(position)}
                        onClick={() => go(hit)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                          position === index ? "bg-accent text-accent-foreground" : "text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{hit.title}</span>
                          {hit.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
