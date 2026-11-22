"use client";

import { EmptyState } from "@/components/layout/empty-state";

/**
 * A section whose records are not built yet.
 *
 * It exists rather than being hidden because the rail is the plan: someone looking at a project
 * can see what will be tracked on it, and the badge at zero is honest about there being nothing
 * there. What it must not do is pretend — no fake rows, no button that leads nowhere.
 */
export function SectionPlaceholder({
  icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <EmptyState
        icon={icon}
        title="Section à venir"
        description="Elle est là pour montrer ce qui sera suivi. Rien n'y est encore enregistrable."
      />
    </div>
  );
}
