"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardNavItem, getNavItems } from "@/components/layout/nav-config";
import { subTabKey, useHiddenNavigation, useSaveHiddenNavigation } from "@/hooks/use-hidden-navigation";
import { useNavigationQuery, type NavigationItem } from "@/hooks/use-navigation";
import { ApiError } from "@/lib/api";
import { subTabScreens } from "@/lib/sub-tabs";
import { cn } from "@/lib/utils";

interface MenuRow {
  href: string;
  label: string;
  depth: number;
}

function rowsOf(items: NavigationItem[], depth = 0): MenuRow[] {
  return items.flatMap((item) => [{ href: item.href, label: item.title, depth }, ...rowsOf(item.children, depth + 1)]);
}

/**
 * Paramètres › Menu: which tabs of the menu, and which sub-tabs inside the screens, the company
 * uses. A ticked box is shown; unticked, it is hidden for everyone in the company. Each box saves
 * at once. The pages still open by their address: this tidies the menu, it does not lock anything.
 */
export function MenuVisibilityCard() {
  const { data: modules, isPending } = useNavigationQuery(true);
  const hidden = useHiddenNavigation();
  const save = useSaveHiddenNavigation();
  const [open, setOpen] = useState<string | null>(null);

  // The menu as the plan builds it, or the built-in one when the plan defines none. The
  // dashboard always stays: everybody has to land somewhere.
  const menu: MenuRow[] = (
    modules && modules.length > 0
      ? rowsOf(modules)
      : getNavItems("TenantAdmin", false, "Business").map((item) => ({ href: item.href, label: item.label, depth: 0 }))
  ).filter((row) => row.href !== dashboardNavItem.href);

  function toggle(key: string, shown: boolean) {
    const next = new Set(hidden);
    if (shown) next.delete(key);
    else next.add(key);
    save.mutate([...next], {
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le menu."),
    });
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Onglets du menu</CardTitle>
          <CardDescription>
            Décochez ce que votre entreprise n&apos;utilise pas : l&apos;onglet disparaît du menu pour tout
            le monde. Le tableau de bord reste toujours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {menu.map((row) => (
                <li key={row.href} className={cn(row.depth > 0 && "pl-6")}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={!hidden.has(row.href)}
                      onCheckedChange={(checked) => toggle(row.href, checked === true)}
                    />
                    {row.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sous-onglets</CardTitle>
          <CardDescription>
            Les onglets à l&apos;intérieur des écrans et des fiches. Ouvrez un écran pour choisir ceux
            qui restent. Il en reste toujours au moins un.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          {subTabScreens.map((screen) => {
            const hiddenCount = screen.tabs.filter((tab) => hidden.has(subTabKey(screen.screen, tab.key))).length;
            const expanded = open === screen.screen;
            return (
              <div key={screen.screen} className="rounded-lg border border-border">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : screen.screen)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                  <span className="flex-1">{screen.title}</span>
                  {hiddenCount > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {hiddenCount} masqué{hiddenCount > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
                {expanded && (
                  <ul className="grid gap-1 border-t border-border px-3 py-2 sm:grid-cols-2">
                    {screen.tabs.map((tab) => {
                      const key = subTabKey(screen.screen, tab.key);
                      const shown = !hidden.has(key);
                      const lastShown = shown && hiddenCount === screen.tabs.length - 1;
                      return (
                        <li key={tab.key}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                            <Checkbox
                              checked={shown}
                              disabled={lastShown}
                              onCheckedChange={(checked) => toggle(key, checked === true)}
                            />
                            {tab.label}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
