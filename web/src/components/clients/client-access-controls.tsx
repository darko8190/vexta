"use client";

import { useState } from "react";
import { KeyRound, Send, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { InvitationLinkDialog } from "@/components/team/invitation-link-dialog";
import { useClientAccess } from "@/hooks/use-clients";
import { ApiError } from "@/lib/api";
import type { ClientAccess, InvitationGrant } from "@/lib/types";

/**
 * NOT CURRENTLY MOUNTED. The client record no longer offers access, by request; the API
 * endpoints behind this are still there and still work. Kept whole rather than deleted so
 * putting it back is a matter of deciding where, not of writing it again.
 *
 * Giving a customer a way into their own file. The same three actions serve a particulier
 * invited on their own record and a contact invited on theirs — pass contactId for the second.
 *
 * Granting is refused without an email because the address becomes the sign-in name. Saying so
 * on the disabled button beats letting someone click and read a server error.
 */
export function ClientAccessControls({
  clientId,
  contactId,
  email,
  name,
  access,
}: {
  clientId: string;
  contactId?: string;
  email: string | null;
  name: string;
  access: ClientAccess;
}) {
  const { grant, resend, revoke } = useClientAccess(clientId);
  const [issued, setIssued] = useState<InvitationGrant | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const pending = grant.isPending || resend.isPending || revoke.isPending;

  async function run(
    action: typeof grant,
    onDone: (result: InvitationGrant) => void,
    fallback: string,
  ) {
    try {
      const result = await action.mutateAsync(contactId);

      // No link means they already had a Vexta account with a password: nothing was sent and
      // there is nothing to copy, so say so rather than opening an empty dialog.
      if (!result.invitationUrl) {
        toast.success(`${name} avait déjà un compte Vexta. Vos dossiers apparaîtront dans ses espaces.`);
        return;
      }

      onDone(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : fallback);
    }
  }

  async function doRevoke() {
    try {
      await revoke.mutateAsync(contactId);
      toast.success("Accès retiré.");
      setConfirmRevoke(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cet accès.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {access.hasAccess ? (
        <>
          <Badge variant={access.invitationPending ? "secondary" : "default"}>
            {access.invitationPending ? "Invitation en attente" : "Accès actif"}
          </Badge>

          {access.invitationPending && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(resend, setIssued, "Impossible de renvoyer cette invitation.")}
            >
              {resend.isPending ? <Spinner /> : <Send />}
              Renvoyer
            </Button>
          )}

          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmRevoke(true)}>
            <ShieldOff />
            Retirer l&apos;accès
          </Button>
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !email}
            onClick={() => run(grant, setIssued, "Impossible de donner cet accès.")}
          >
            {grant.isPending ? <Spinner /> : <KeyRound />}
            Donner l&apos;accès
          </Button>
          {!email && (
            <span className="text-sm text-muted-foreground">
              Ajoutez un courriel : il sert d&apos;identifiant.
            </span>
          )}
        </>
      )}

      <InvitationLinkDialog
        grant={issued}
        recipientName={name}
        recipientEmail={email}
        onOpenChange={(open) => !open && setIssued(null)}
      />

      <ConfirmDeleteDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Retirer cet accès ?"
        description={`${name} ne pourra plus se connecter. La fiche reste intacte et l'accès peut être redonné.`}
        onConfirm={doRevoke}
        pending={revoke.isPending}
      />
    </div>
  );
}
