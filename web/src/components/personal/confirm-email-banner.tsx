"use client";

import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useEmailStatusQuery, useSendEmailConfirmation } from "@/hooks/use-personal-profile";
import { ApiError } from "@/lib/api";

/**
 * Shown until the person proves their address. A company that typed this address on a customer
 * file sent its invoices there, but only the inbox can say the account is that customer — so
 * those invoices stay out of sight until the link is opened.
 */
export function ConfirmEmailBanner() {
  const { data } = useEmailStatusQuery();
  const send = useSendEmailConfirmation();

  if (!data || data.confirmed) return null;

  async function onSend() {
    try {
      const result = await send.mutateAsync();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Le courriel n'a pas pu être envoyé.");
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
      <MailCheck className="hidden size-5 shrink-0 text-primary sm:block" />
      <p className="flex-1 text-sm text-foreground">
        Confirmez votre adresse <strong>{data.email}</strong> pour voir les factures qu&apos;une
        entreprise vous a envoyées à cette adresse, même avant que vous ayez un compte.
      </p>
      <Button size="sm" variant="outline" onClick={onSend} disabled={send.isPending || send.isSuccess}>
        {send.isPending && <Spinner />}
        {send.isSuccess ? "Lien envoyé" : "Envoyer le lien"}
      </Button>
    </div>
  );
}
