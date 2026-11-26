"use client";

import { StatusDot } from "@/components/layout/section-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SettingsTab {
  value: string;
  label: string;
  status?: "ok" | "todo";
  content: React.ReactNode;
}

/**
 * A section of settings made of several cards, one tab each.
 *
 * Tabs rather than the cards stacked: a section such as Soumissions held three forms one under
 * the other, and the third was found by scrolling past the first two. Tabs rather than the
 * cards side by side: each is a form with long fields, and two abreast leaves neither wide
 * enough to read. On a phone the row of tabs scrolls sideways, with nothing hidden in a menu.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.value}>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" className="mb-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2 px-2.5">
              {tab.label}
              {tab.status && <StatusDot status={tab.status} />}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
