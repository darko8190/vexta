"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useFormPublicLinkQuery, useFormsQuery, useSendFormLink } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An address offered with one click: the client's own, or one of its contacts'. */
export interface FormRecipient {
  label: string;
  email: string;
}

/**
 * Sends a form's link to one person, from the company's name.
 *
 * Two ways in. From a form, the form is known and the address is typed: a form often goes to
 * somebody who is not a client yet. From a client's file, the form is picked and the client's
 * addresses are one click away — which also means the link is sure to be recognised, so a form
 * that files on a client's record goes to this one without a sign-in.
 */
export function SendFormDialog({
  open,
  onOpenChange,
  formId,
  recipients = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form to send. Left out to let the person pick one. */
  formId?: string;
  recipients?: FormRecipient[];
}) {
  const send = useSendFormLink();
  const { data: forms } = useFormsQuery();
  const [picked, setPicked] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Fresh fields each time it opens, set during render rather than in an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setEmail(recipients[0]?.email ?? "");
      setMessage("");
      setTouched(false);
    }
  }

  const choosable = (forms ?? []).filter((form) => form.isPublished);
  const chosen = formId ?? picked;
  const { data: link } = useFormPublicLinkQuery(chosen ?? undefined);
  const blocked = link && !link.path ? (link.missing ?? "Ce formulaire n'a pas encore de lien.") : null;

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const showEmailError = touched && !emailValid;
  const formTitle = (forms ?? []).find((form) => form.id === chosen)?.title;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!chosen || !emailValid || blocked) return;
    try {
      const result = await send.mutateAsync({ id: chosen, email: email.trim(), message: message.trim() || null });
      // Said here, once, because it decides whose record the answers land on.
      toast.success("Formulaire envoyé.", {
        description: !result.filesOnClient
          ? email.trim()
          : result.clientName
            ? `Les réponses iront au dossier de ${result.clientName}, sans connexion.`
            : "Cette adresse n'est celle d'aucun client : la personne devra se connecter pour le remplir.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Le formulaire n'a pas pu être envoyé.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{formId && formTitle ? `Envoyer « ${formTitle} »` : "Envoyer un formulaire"}</DialogTitle>
            <DialogDescription>
              La personne reçoit un courriel au nom de votre entreprise, avec un bouton pour le
              remplir. Si l&apos;adresse est celle d&apos;un de vos clients, ce qu&apos;elle
              remplit va à son dossier sans qu&apos;elle ait à se connecter.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="px-4 py-4">
            {!formId && (
              <Field>
                <FieldLabel htmlFor="send-form-pick">Formulaire</FieldLabel>
                <Select value={picked} onValueChange={(value) => setPicked(value as string | null)}>
                  <SelectTrigger id="send-form-pick" className="w-full">
                    <SelectValue placeholder="Choisir un formulaire">
                      {(value: string | null) => choosable.find((form) => form.id === value)?.title ?? "Choisir un formulaire"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {choosable.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touched && !chosen && <FieldError>Choisissez le formulaire à envoyer.</FieldError>}
              </Field>
            )}

            {blocked ? (
              <p className="text-sm text-destructive">{blocked}</p>
            ) : (
              <>
                <Field data-invalid={showEmailError || undefined}>
                  <FieldLabel htmlFor="send-form-email">Courriel</FieldLabel>
                  <Input
                    id="send-form-email"
                    type="email"
                    autoComplete="off"
                    autoFocus={Boolean(formId)}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={showEmailError}
                  />
                  {recipients.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {recipients.map((recipient) => (
                        <Button
                          key={recipient.email}
                          type="button"
                          size="xs"
                          variant={recipient.email === email.trim() ? "secondary" : "outline"}
                          onClick={() => setEmail(recipient.email)}
                        >
                          {recipient.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  {showEmailError && <FieldError>Indiquez une adresse courriel valide.</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="send-form-message">Message</FieldLabel>
                  <Textarea
                    id="send-form-message"
                    rows={4}
                    maxLength={2000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <FieldDescription>Facultatif : ajouté au courriel, au-dessus du bouton.</FieldDescription>
                </Field>
              </>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={send.isPending || Boolean(blocked)}>
              {send.isPending && <Spinner />}
              Envoyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
