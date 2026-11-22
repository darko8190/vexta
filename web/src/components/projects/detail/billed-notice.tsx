import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Why a billed project's figures cannot be touched, said where somebody would otherwise reach
 * for a field.
 *
 * One component for the three sections that freeze — materials, hours and expenses — because
 * three copies of the same sentence drift apart the first time the wording is reconsidered.
 * Documents and notes are not frozen, so they never show this.
 */
export function BilledNotice() {
  return (
    <Alert className="mb-4">
      <AlertTitle>Projet facturé</AlertTitle>
      <AlertDescription>
        Ce projet est facturé : les chiffres de cette section sont ceux portés sur la facture.
        Pour les corriger, rouvrez le projet depuis « Modifier ».
      </AlertDescription>
    </Alert>
  );
}
