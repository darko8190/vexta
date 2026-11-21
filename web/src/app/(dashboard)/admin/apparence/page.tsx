"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { BrandingSettingsCard } from "@/components/admin/branding-settings-card";
import { useBrandingQuery } from "@/hooks/use-branding";

/** Pattern 5 — Settings / Configuration. */
export default function BrandingPage() {
  const { data, isLoading } = useBrandingQuery();

  return (
    <div>
      <PageHeader
        title="Apparence"
        description="L'image de marque que voient les visiteurs et les entreprises clientes."
      />

      {isLoading || !data ? (
        <Skeleton className="h-96 w-full max-w-3xl" />
      ) : (
        <div className="max-w-3xl">
          <BrandingSettingsCard branding={data} />
        </div>
      )}
    </div>
  );
}
