"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { MailgunSettingsCard } from "@/components/admin/mailgun-settings-card";
import { StripeSettingsCard } from "@/components/admin/stripe-settings-card";
import { usePlatformSettingsQuery } from "@/hooks/use-platform-settings";

export default function PlatformSettingsPage() {
  const { data, isLoading } = usePlatformSettingsQuery();

  return (
    <div>
      <PageHeader
        title="Intégrations"
        description="Configurez les passerelles Mailgun et Stripe utilisées par toute la plateforme Vexta."
      />

      {isLoading || !data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <MailgunSettingsCard settings={data} />
          <StripeSettingsCard settings={data} />
        </div>
      )}
    </div>
  );
}
