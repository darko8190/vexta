"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useBillingSettingsQuery, useSavePricing } from "@/hooks/use-billing-settings";
import { ApiError } from "@/lib/api";
import { marginModeLabels } from "@/lib/labels";
import { sellingPriceFrom } from "@/lib/pricing";
import type { MarginMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The example that makes the two conventions tell themselves apart. */
const EXAMPLE_COST = 100;
const EXAMPLE_MARGIN = 35;

function money(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

const options: { mode: MarginMode; formula: string; meaning: string }[] = [
  {
    mode: "Multiplication",
    formula: "vendant = achat × (1 + marge / 100)",
    meaning: "Une majoration sur le coût : vous ajoutez le pourcentage à ce que vous avez payé.",
  },
  {
    mode: "Division",
    formula: "vendant = achat ÷ (1 − marge / 100)",
    meaning:
      "Une marge sur le prix de vente : le profit représente vraiment ce pourcentage de ce que le client paie.",
  },
];

/**
 * Which of the two conventions the company means by "la marge".
 *
 * Both are called "la marge" on a job site and give different numbers from the same
 * percentage, so the worked example is the card rather than a footnote to it — and it is
 * computed by the same function that prices a line, so it can never drift from the arithmetic.
 */
export function MarginModeCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSavePricing();

  // Null until something is picked, so the saved choice shows through without an effect
  // copying it into state.
  const [picked, setPicked] = useState<MarginMode | null>(null);
  const saved = settings?.marginMode ?? "Multiplication";
  const chosen = picked ?? saved;

  async function onSave() {
    try {
      await save.mutateAsync({
        defaultHourlyRate: settings?.defaultHourlyRate ?? null,
        marginMode: chosen,
        defaultPricePolicyId: settings?.defaultPricePolicyId ?? null,
      });
      toast.success("Mode de calcul enregistré.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce choix.");
    }
  }

  if (isLoading) return <Skeleton className="h-80 max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="size-4" />
          Mode de calcul de la marge
        </CardTitle>
        <CardDescription>
          Les deux façons de calculer s&apos;appellent « la marge » et ne donnent pas le même
          montant. Choisissez celle que votre entreprise utilise.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div role="radiogroup" aria-label="Mode de calcul de la marge" className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selected = chosen === option.mode;
            const example = sellingPriceFrom(EXAMPLE_COST, EXAMPLE_MARGIN, option.mode);

            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPicked(option.mode)}
                className={cn(
                  "flex h-full flex-col gap-2 rounded-lg border px-3 py-3 text-left transition-colors",
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {marginModeLabels[option.mode]}
                </span>
                <code className="text-xs text-muted-foreground">{option.formula}</code>
                <span className="text-sm text-muted-foreground">{option.meaning}</span>
                <span className="mt-auto text-sm text-foreground tabular-nums">
                  {money(EXAMPLE_COST)} à {EXAMPLE_MARGIN} %{" "}
                  <span aria-hidden="true">→</span>{" "}
                  <span className="font-medium">{example == null ? "—" : money(example)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <FieldDescription className="mt-4">
          Changer ce choix ne retouche aucun prix déjà enregistré : il change ce que veut dire un
          pourcentage au prochain calcul.
        </FieldDescription>
      </CardContent>

      <CardFooter>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}
