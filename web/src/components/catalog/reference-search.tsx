"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProductCategoriesQuery } from "@/hooks/use-products";
import { api } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PagedResult, ProductSearchResult } from "@/lib/types";

/** Where a reference is looked up: the catalogue, the equipment, the assemblies. */
export type ReferenceSource = "produit" | "equipement" | "assemblage";

/** One thing found, in the shape every line can take its figures from. */
export interface ReferencePick {
  source: ReferenceSource;
  id: string;
  title: string;
  code: string | null;
  unit: string | null;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  /** Only for equipment: Heure, Jour, Semaine, Unite. */
  equipmentUnit?: string;
  /** What the list shows under the name. */
  detail?: string | null;
}

interface ProductBrowseResult {
  id: string;
  number: number;
  code: string | null;
  title: string;
  unit: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  tracksInventory: boolean;
  quantityOnHand: number;
  imageUrl: string | null;
}

interface EquipmentRow {
  id: string;
  number: number;
  name: string;
  unit: string;
  costRate: number | null;
  sellingRate: number | null;
  serialNumber: string | null;
}

interface AssemblyRow {
  id: string;
  number: number;
  name: string;
  description: string | null;
  unitCost: number;
  unitPrice: number;
  itemCount: number;
}

const pad = (n: number) => String(n).padStart(4, "0");

async function search(source: ReferenceSource, term: string): Promise<ReferencePick[]> {
  if (source === "produit") {
    const rows = await api.get<ProductSearchResult[]>(`products/search?term=${encodeURIComponent(term)}&take=12`);
    return rows.map((p) => ({
      source,
      id: p.id,
      title: p.title,
      code: p.code,
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      marginPercent: p.marginPercent,
      sellingPrice: p.sellingPrice,
      detail: [p.code ?? `A-${pad(p.number)}`, p.categoryName].filter(Boolean).join(" · "),
    }));
  }
  if (source === "equipement") {
    const page = await api.get<PagedResult<EquipmentRow>>(`equipements?search=${encodeURIComponent(term)}&pageSize=12`);
    return page.items.map((e) => ({
      source,
      id: e.id,
      title: e.name,
      code: null,
      unit: null,
      equipmentUnit: e.unit,
      purchasePrice: e.costRate,
      marginPercent: null,
      sellingPrice: e.sellingRate,
      detail: [`É-${pad(e.number)}`, e.serialNumber].filter(Boolean).join(" · "),
    }));
  }
  const rows = await api.get<AssemblyRow[]>(`assemblages?search=${encodeURIComponent(term)}`);
  return rows.slice(0, 12).map((a) => ({
    source,
    id: a.id,
    title: a.name,
    code: null,
    unit: null,
    purchasePrice: a.unitCost,
    marginPercent: null,
    sellingPrice: a.unitPrice,
    detail: `AS-${pad(a.number)} · ${a.itemCount} matériau${a.itemCount > 1 ? "x" : ""}`,
  }));
}

/**
 * The description of a line, which is also where its reference is searched: typing shows what
 * matches in the catalogue (or the equipment, or the assemblies), picking one fills the line,
 * and anything typed and not picked stays a description written by hand. The magnifier opens
 * the advanced search: by category, with the pictures.
 */
export function ReferenceSearchInput({
  id,
  value,
  onChange,
  onPick,
  source,
  placeholder = "Description ou recherche…",
  invalid,
  hidePrices = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (pick: ReferencePick) => void;
  /** Null for a line that is only typed (labour, other): a plain field. */
  source: ReferenceSource | null;
  placeholder?: string;
  invalid?: boolean;
  /** For the crew: find and pick, without the prices. */
  hidePrices?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [touched, setTouched] = useState(false);
  const term = useDebouncedValue(value.trim(), 250);
  const wrapper = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["reference-search", source, term],
    queryFn: () => search(source!, term),
    enabled: Boolean(source) && touched && term.length >= 2,
    placeholderData: (previous) => previous,
  });
  const results = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    function onDown(event: PointerEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function pick(item: ReferencePick) {
    onPick(item);
    setOpen(false);
    setTouched(false);
  }

  const showList = open && source && touched && term.length >= 2;

  return (
    <div ref={wrapper} className="relative">
      <div className="flex gap-1">
        <Input
          id={id}
          value={value}
          placeholder={source ? placeholder : "Description"}
          aria-invalid={invalid}
          autoComplete="off"
          role={source ? "combobox" : undefined}
          aria-expanded={source ? Boolean(showList) : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setTouched(true);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!showList || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              pick(results[highlight]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {source && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Recherche avancée"
            title="Recherche avancée"
            onClick={() => setAdvanced(true)}
          >
            <Search />
          </Button>
        )}
      </div>

      {showList && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {results.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {isFetching ? "Recherche…" : "Rien ne correspond. Le texte restera une description libre."}
            </p>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm",
                  index === highlight && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.title}</span>
                  {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                </span>
                {!hidePrices && item.sellingPrice != null && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatAmount(item.sellingPrice)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {source && (
        <AdvancedSearchDialog
          open={advanced}
          onOpenChange={setAdvanced}
          source={source}
          initialTerm={value}
          hidePrices={hidePrices}
          onPick={(item) => {
            setAdvanced(false);
            pick(item);
          }}
        />
      )}
    </div>
  );
}

const ALL = "toutes";

/** The search with room: categories, pictures, and the figures side by side. */
export function AdvancedSearchDialog({
  open,
  onOpenChange,
  source,
  initialTerm = "",
  onPick,
  hidePrices = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ReferenceSource;
  initialTerm?: string;
  onPick: (pick: ReferencePick) => void;
  hidePrices?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {source === "produit" ? "Chercher dans le catalogue" : source === "equipement" ? "Chercher un équipement" : "Chercher un assemblage"}
          </DialogTitle>
          <DialogDescription>Choisissez un élément pour remplir la ligne.</DialogDescription>
        </DialogHeader>
        {open && <AdvancedBody source={source} initialTerm={initialTerm} onPick={onPick} hidePrices={hidePrices} />}
      </DialogContent>
    </Dialog>
  );
}

function AdvancedBody({
  source,
  initialTerm,
  onPick,
  hidePrices,
}: {
  source: ReferenceSource;
  initialTerm: string;
  onPick: (pick: ReferencePick) => void;
  hidePrices: boolean;
}) {
  const [typed, setTyped] = useState(initialTerm);
  const [categoryId, setCategoryId] = useState(ALL);
  const term = useDebouncedValue(typed.trim(), 250);
  const { data: categories } = useProductCategoriesQuery();

  const products = useQuery({
    queryKey: ["products", "parcourir", term, categoryId],
    queryFn: () =>
      api.get<ProductBrowseResult[]>(
        `products/parcourir?term=${encodeURIComponent(term)}${categoryId !== ALL ? `&categoryId=${categoryId}` : ""}`,
      ),
    enabled: source === "produit",
  });
  const others = useQuery({
    queryKey: ["reference-search", source, "avance", term],
    queryFn: () => search(source, term),
    enabled: source !== "produit",
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Nom, code, code-barres…"
          aria-label="Rechercher"
        />
        {source === "produit" && (
          <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? ALL)}>
            <SelectTrigger className="sm:w-56" aria-label="Catégorie">
              <SelectValue>
                {(value: string) => (value === ALL ? "Toutes les catégories" : (categories?.find((c) => c.id === value)?.name ?? ""))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les catégories</SelectItem>
              {(categories ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {source === "produit" ? (
          products.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (products.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun produit ne correspond.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(products.data ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    onPick({
                      source: "produit",
                      id: p.id,
                      title: p.title,
                      code: p.code,
                      unit: p.unit,
                      purchasePrice: p.purchasePrice,
                      marginPercent: p.marginPercent,
                      sellingPrice: p.sellingPrice,
                    })
                  }
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <ImageOff className="size-6 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="grid gap-0.5 p-2 text-sm">
                    <span className="line-clamp-2 font-medium">{p.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[p.code ?? `A-${pad(p.number)}`, p.categoryName, p.subCategoryName].filter(Boolean).join(" · ")}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs">
                      {!hidePrices && p.sellingPrice != null ? (
                        <span className="tabular-nums">{formatAmount(p.sellingPrice)}</span>
                      ) : (
                        <span />
                      )}
                      {p.tracksInventory && <Badge variant="secondary">{p.quantityOnHand} en stock</Badge>}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : others.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (others.data ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Rien ne correspond.</p>
        ) : (
          <ul className="grid gap-1">
            {(others.data ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.title}</span>
                    {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                  </span>
                  {!hidePrices && item.sellingPrice != null && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatAmount(item.sellingPrice)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
