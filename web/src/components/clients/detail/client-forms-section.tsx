"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSharesList } from "@/components/forms/form-shares-list";
import { SendFormDialog, type FormRecipient } from "@/components/forms/send-form-dialog";
import { useClientContactsQuery } from "@/hooks/use-clients";

/**
 * The forms sent to this client, and the way to send one. The client's own address and its
 * contacts' are offered with one click, so the link is one the client is recognised by: a form
 * that files on a client's record (an asset, a request for a quote) then goes to this file
 * without anybody having to sign in.
 */
export function ClientFormsSection({
  clientId,
  clientName,
  clientEmail,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
}) {
  const { data: contacts } = useClientContactsQuery(clientId);
  const [open, setOpen] = useState(false);

  const recipients: FormRecipient[] = [];
  if (clientEmail?.trim()) recipients.push({ label: clientName, email: clientEmail.trim() });
  for (const contact of contacts ?? []) {
    const email = contact.email?.trim();
    if (!email || recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) continue;
    recipients.push({ label: `${contact.firstName} ${contact.lastName}`.trim() || email, email });
  }

  const sendButton = (
    <Button onClick={() => setOpen(true)}>
      <Send />
      Envoyer un formulaire
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Formulaires</h2>
          <p className="text-sm text-muted-foreground">
            Les formulaires envoyés à ce client par courriel, et ceux qu&apos;il a remplis.
          </p>
        </div>
        {sendButton}
      </div>

      <FormSharesList clientId={clientId} emptyAction={sendButton} />

      <SendFormDialog open={open} onOpenChange={setOpen} recipients={recipients} />
    </div>
  );
}
