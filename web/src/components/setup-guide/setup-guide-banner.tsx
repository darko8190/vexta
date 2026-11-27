"use client";

import Link from "next/link";
import { Compass, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { visibleSteps } from "@/components/setup-guide/guide-steps";
import { useBillingStateQuery } from "@/hooks/use-billing";
import { emptyGuideState, useSaveSetupGuide, useSetupGuideQuery } from "@/hooks/use-setup-guide";
import { cn } from "@/lib/utils";

/**
 * On the owner's dashboard until the setup guide is gone through or hidden: the way back into it
 * for somebody who stopped half-way.
 */
export function SetupGuideBanner() {
  const { data: billing } = useBillingStateQuery();
  const canManage = billing?.kind === "Business" && billing.canManage;
  const { data: saved, isSuccess } = useSetupGuideQuery(canManage === true);
  const save = useSaveSetupGuide();

  if (!canManage || !isSuccess) return null;
  const state = saved ?? emptyGuideState;
  if (state.closedAt) return null;

  const steps = visibleSteps(state.answers);
  const seen = steps.filter((step) => state.seen.includes(step.key)).length;
  if (seen >= steps.length) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <Compass className="size-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {seen === 0 ? "Préparez Vexta en quelques questions" : "Continuez la configuration de votre entreprise"}
        </p>
        <p className="text-sm text-muted-foreground">
          {seen === 0
            ? "Un guide simple vous accompagne : votre fiche, votre page publique, vos factures et le reste."
            : `${seen} étape${seen > 1 ? "s" : ""} sur ${steps.length} terminée${seen > 1 ? "s" : ""}.`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/guide" className={cn(buttonVariants())}>
          {seen === 0 ? "Commencer" : "Continuer"}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Masquer"
          title="Masquer (le guide reste dans Paramètres)"
          onClick={() => save.mutate({ ...state, closedAt: new Date().toISOString() })}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
