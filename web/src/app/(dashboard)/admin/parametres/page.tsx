"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { AnthropicSettingsCard } from "@/components/admin/anthropic-settings-card";
import { MailgunSettingsCard } from "@/components/admin/mailgun-settings-card";
import { R2SettingsCard } from "@/components/admin/r2-settings-card";
import { StripeSettingsCard } from "@/components/admin/stripe-settings-card";
import { usePlatformSettingsQuery } from "@/hooks/use-platform-settings";

export default function PlatformSettingsPage() {
  const { data, isLoading } = usePlatformSettingsQuery();

  return (
    <div>
      <PageHeader
        title="Intégrations"
        description="Configurez les passerelles utilisées par toute la plateforme Vexta."
      />

      {isLoading || !data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        // items-start: without it the grid stretches every card to the tallest in its row, so the
        // short ones get a border drawn around a few hundred pixels of nothing.
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <MailgunSettingsCard settings={data} />
          <StripeSettingsCard settings={data} />
          <R2SettingsCard settings={data} />
          <AnthropicSettingsCard settings={data} />
        </div>
      )}
    </div>
  );
}
