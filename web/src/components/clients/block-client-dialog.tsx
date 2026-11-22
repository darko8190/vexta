"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useBlockClient, useBlockClientAccount } from "@/hooks/use-client-account";
import { ApiError } from "@/lib/api";
import type { ClientRecord } from "@/lib/types";

/**
 * Barring a client, or barring only their account — and letting either back in.
 *
 * One dialog for both, because the question is the same shape and only the consequence differs.
 * The reason is asked for and not optional in practice: whoever hits the refusal at the counter
 * in three months is not the person taking this decision today, and "Ce client est bloqué."
 * with no explanation is a door nobody can open or justify.
 */
export function BlockClientDialog({
  open,
  onOpenChange,
  client,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ClientRecord;
  /** "client" bars them outright; "account" bars the tab and leaves the work alone. */
  scope: "client" | "account";
}) {
  const blockClient = useBlockClient(client.id);
  const blockAccount = useBlockClientAccount(client.id);

  const mutation = scope === "client" ? blockClient : blockAccount;
  const currentlyBlocked = scope === "client" ? client.isBlocked : client.isAccountBlocked;
  const currentReason = scope === "client" ? client.blockedReason : client.accountBlockedReason;

  // Seeded once, at mount, rather than mirrored from the prop in an effect: the caller mounts
  // this dialog fresh each time it is opened, so there is nothing to re-sync — and copying a
  // prop into state inside an effect is the one pattern the lint rules here refuse outright.
  const [reason, setReason] = useState(currentReason ?? "");

  async function confirm() {
    try {
      await mutation.mutateAsync({
        isBlocked: !currentlyBlocked,
        reason: reason.trim() || null,
      });
      toast.success(
        currentlyBlocked
          ? scope === "client"
            ? "Client débloqué."
            : "Compte débloqué."
          : scope === "client"
            ? "Client bloqué."
            : "Compte bloqué.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer ce changement.",
      );
    }
  }

  const title = currentlyBlocked
    ? scope === "client"
      ? `Débloquer ${client.name} ?`
      : `Débloquer le compte de ${client.name} ?`
    : scope === "client"
      ? `Bloquer ${client.name} ?`
      : `Bloquer le compte de ${client.name} ?`;

  const description = currentlyBlocked
    ? scope === "client"
      ? "Vous pourrez de nouveau ouvrir des projets et émettre des factures pour ce client."
      : "Vous pourrez de nouveau porter des factures à son compte."
    : scope === "client"
      ? "Aucun nouveau projet, aucune nouvelle facture, et rien de commandé sur votre page publique. Ses projets, ses factures et son solde restent intacts."
      : "Ses factures ne pourront plus être portées au compte : il paiera à mesure. Le travail et la facturation continuent normalement.";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {!currentlyBlocked && (
          <Field>
            <FieldLabel htmlFor="block-reason">Raison</FieldLabel>
            <Input
              id="block-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Comptes impayés depuis mars"
              maxLength={300}
            />
            <FieldDescription>
              Reprise mot pour mot dans le refus. C&apos;est ce que lira la personne au comptoir
              dans trois mois.
            </FieldDescription>
          </Field>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {currentlyBlocked ? "Débloquer" : "Bloquer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
