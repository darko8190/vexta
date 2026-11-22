"use client";

import { useState } from "react";
import { Check, Copy, MailCheck, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AccessGranted } from "@/lib/types";

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Shown right after access is granted or resent. The link is always here, even when the email
 * went out: "I never got it" is the most common next sentence, and the answer should be one
 * click away rather than a resend and another wait.
 */
export function InvitationLinkDialog({
  grant,
  onOpenChange,
}: {
  grant: AccessGranted | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!grant) return;
    try {
      await navigator.clipboard.writeText(grant.invitationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the field is selectable either way.
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={Boolean(grant)}
      onOpenChange={(open) => {
        if (!open) setCopied(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accès créé</DialogTitle>
          <DialogDescription>
            {grant?.employee.firstName} doit ouvrir ce lien pour choisir son mot de passe. Il
            expire le {grant ? formatExpiry(grant.expiresAt) : ""} et ne sert qu&apos;une fois.
          </DialogDescription>
        </DialogHeader>

        {grant && (
          <div className="space-y-4">
            <div
              className={
                grant.emailSent
                  ? "flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                  : "flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
              }
            >
              {grant.emailSent ? (
                <MailCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <MailX className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
              )}
              <p className="text-muted-foreground">
                {grant.emailSent
                  ? `Un courriel vient de partir à ${grant.employee.email}.`
                  : "Aucun courriel n'a été envoyé : Mailgun n'est pas configuré ou a refusé le message. Transmettez le lien vous-même."}
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                readOnly
                value={grant.invitationUrl}
                aria-label="Lien d'invitation"
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={copy} className="shrink-0">
                {copied ? <Check /> : <Copy />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" />}>Terminé</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
