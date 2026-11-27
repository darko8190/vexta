"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { SetupFraction, type SetupProgress } from "@/components/layout/section-nav";
import { Badge } from "@/components/ui/badge";
import { ReorderViewsDialog } from "@/components/layout/reorder-views-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { applyOrder, useViewOrder } from "@/hooks/use-view-order";

export interface SettingsTab {
  value: string;
  label: string;
  status?: SetupProgress;
  /** How many things the tab holds, for a tab that is a list. Shown at zero too. */
  count?: number;
  content: React.ReactNode;
}

/**
 * A section of settings made of several cards, one tab each.
 *
 * Tabs rather than the cards stacked: a section such as Soumissions held three forms one under
 * the other, and the third was found by scrolling past the first two. Tabs rather than the
 * cards side by side: each is a form with long fields, and two abreast leaves neither wide
 * enough to read. On a phone the row of tabs scrolls sideways, with nothing hidden in a menu.
 *
 * `nested` is for a set of tabs inside another tab: drawn as pills, so the two rows read as two
 * levels rather than one long row.
 */
export function SettingsTabs({ tabs, nested = false }: { tabs: SettingsTab[]; nested?: boolean }) {
  const [reordering, setReordering] = useState(false);
  const { order, save } = useViewOrder(`onglets:${tabs.map((tab) => tab.value).join(",")}`, tabs.map((tab) => tab.value));
  const ordered = applyOrder(tabs, order, (tab) => tab.value);

  return (
    <Tabs defaultValue={ordered[0]?.value}>
      <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant={nested ? "default" : "line"} className="mb-4">
          {ordered.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2 px-2.5">
              {tab.label}
              {tab.status && <SetupFraction progress={tab.status} />}
              {tab.count !== undefined && (
                <Badge variant="secondary" className="tabular-nums">
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.length > 2 && (
          <button
            type="button"
            onClick={() => setReordering(true)}
            title="Réorganiser les onglets"
            aria-label="Réorganiser les onglets"
            className="mb-4 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowUpDown className="size-4 opacity-60" />
          </button>
        )}
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
      <ReorderViewsDialog
        open={reordering}
        onOpenChange={setReordering}
        items={ordered.map((tab) => ({ key: tab.value, label: tab.label }))}
        onSave={save}
        onReset={() => save(null)}
      />
    </Tabs>
  );
}
