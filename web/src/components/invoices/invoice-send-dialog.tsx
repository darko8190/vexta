"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/components/projects/detail/document-file-size";
import { useSaveClientContact } from "@/hooks/use-clients";
import { useInvoiceSendDefaultsQuery, useSendInvoice, type SendBase } from "@/hooks/use-invoices";
import { MAX_UPLOAD_BYTES, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import { formatQuoteNumber, type InvoiceRecord, type QuoteRecord } from "@/lib/types";
import { ex } from "@/lib/placeholders";

/** A file picked in this form and already in the library, waiting to ride along. */
interface Upload {
  mediaAssetId: string;
  fileName: string;
  sizeBytes: number;
}

const emptyContact = { firstName: "", lastName: "", email: "", role: "" };

/**
 * The invoice's covering email, before it leaves.
 *
 * Everything on it is a decision somebody makes once per invoice and would otherwise make in
 * their own mail client, away from the record: who it goes to, who sees a copy, what it says,
 * and what travels with it. Nothing here is guessed — the wording is the company's own template
 * with this invoice's figures in it, so the screen shows the message that will arrive.
 */
/** What is being sent: an invoice, or a quote, which goes out the same way with its own words. */
interface Sendable {
  base: SendBase;
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  /** Where the documents offered above come from, or null when there are none to offer. */
  documentsFrom: string | null;
  /** "la facture", "la soumission". */
  noun: string;
  /** "Facture", "Soumission" — the file name and the confirmation. */
  title: string;
  sentMessage: string;
}

export function InvoiceSendDialog({
  open,
  onOpenChange,
  invoice: invoiceRecord,
  quote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: InvoiceRecord;
  quote?: QuoteRecord;
}) {
  const invoice: Sendable = quote
    ? {
        base: "soumissions",
        id: quote.id,
        number: formatQuoteNumber(quote.number),
        clientId: quote.clientId,
        clientName: quote.clientName,
        documentsFrom: "de la soumission",
        noun: "la soumission",
        title: "Soumission",
        sentMessage: "Soumission envoyée",
      }
    : {
        base: "invoices",
        id: invoiceRecord!.id,
        number: invoiceRecord!.number,
        clientId: invoiceRecord!.clientId,
        clientName: invoiceRecord!.clientName,
        documentsFrom: invoiceRecord!.projectId ? "du projet" : null,
        noun: "la facture",
        title: "Facture",
        sentMessage: "Facture envoyée",
      };
  const queryClient = useQueryClient();
  const { data: defaults, isLoading, isError } = useInvoiceSendDefaultsQuery(invoice.id, open, invoice.base);
  const send = useSendInvoice(invoice.base);
  const upload = useUploadMedia();
  const saveContact = useSaveClientContact(invoice.clientId);
  const fileInput = useRef<HTMLInputElement>(null);

  // Null means "whatever the API filled in". Derived at render rather than copied into state by
  // an effect: the defaults arrive after the dialog opens, and an effect that copies them is an
  // effect that fights with whatever has been typed since.
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [ccIds, setCcIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [contact, setContact] = useState(emptyContact);

  const toValue = to ?? defaults?.to ?? "";
  const subjectValue = subject ?? defaults?.subject ?? "";
  const bodyValue = body ?? defaults?.body ?? "";

  const recipients = defaults?.recipients ?? [];

  // A contact created a moment ago, before the refetched list has arrived. Without this the
  // select would show nothing selected right after it was told to select something.
  const options =
    !toValue || recipients.some((person) => person.email === toValue)
      ? recipients
      : [...recipients, { id: null, name: toValue, email: toValue, role: "Ajouté à l'instant" }];

  function reset() {
    setTo(null);
    setSubject(null);
    setBody(null);
    setCcIds([]);
    setDocumentIds([]);
    setUploads([]);
    setAddingContact(false);
    setContact(emptyContact);
  }

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  async function onPick(files: FileList) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} dépasse la taille permise.`);
        continue;
      }

      try {
        const asset = await upload.mutateAsync(file);
        setUploads((current) => [
          ...current,
          { mediaAssetId: asset.id, fileName: asset.fileName, sizeBytes: file.size },
        ]);
      } catch (error) {
        toast.error(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : `Impossible de téléverser ${file.name}.`,
        );
      }
    }
  }

  async function onAddContact() {
    const firstName = contact.firstName.trim();
    const lastName = contact.lastName.trim();
    const email = contact.email.trim();

    if (!firstName || !lastName) {
      toast.error("Le prénom et le nom du contact sont requis.");
      return;
    }

    if (!email) {
      toast.error(`Un contact sans courriel ne peut pas recevoir ${invoice.noun}.`);
      return;
    }

    try {
      const created = await saveContact.mutateAsync({
        values: {
          firstName,
          lastName,
          role: contact.role.trim() || null,
          email,
          phone: null,
          notes: null,
        },
      });

      // The contact belongs to the client's file now, which is the whole point of adding one
      // from here. The defaults are this invoice's own key, so they have to be told.
      await queryClient.invalidateQueries({ queryKey: ["invoice-send-defaults", invoice.base, invoice.id] });

      setTo(created.email ?? email);
      setContact(emptyContact);
      setAddingContact(false);
      toast.success(`${created.firstName} ${created.lastName} a été ajouté aux contacts du client.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ajouter ce contact.");
    }
  }

  async function onSend() {
    try {
      const result = await send.mutateAsync({
        id: invoice.id,
        values: {
          to: toValue.trim(),
          // Filtered because InvoiceRecipient.id is nullable for the client's own address; an
          // employee always has one, and a blank id would come back as a 400 about a GUID.
          ccEmployeeIds: ccIds.filter(Boolean),
          subject: subjectValue,
          body: bodyValue,
          mediaAssetIds: uploads.map((file) => file.mediaAssetId),
          projectDocumentIds: documentIds,
        },
      });

      toast.success(`${invoice.sentMessage} à ${result.email}.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      // The API says what went wrong — an address it refused, a limit the attachments passed,
      // Mailgun turning the key down. "Réessayez" would send someone to press the same button.
      toast.error(error instanceof ApiError ? error.message : `Impossible d'envoyer ${invoice.noun}.`);
    }
  }

  const documents = defaults?.projectDocuments ?? [];
  const employees = defaults?.employees ?? [];

  return (
    <Dialog
      open={open}
      // Cleared as the dialog closes rather than as it opens: the same reset, in an event
      // handler, where it cannot cascade a render.
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer {invoice.noun} {invoice.number}</DialogTitle>
          <DialogDescription>
            {`À ${invoice.clientName}, avec ${invoice.noun} en pièce jointe.`}
          </DialogDescription>
        </DialogHeader>

        <form
          id="invoice-send-form"
          className="min-h-0 overflow-y-auto"
          // Stops here rather than bubbling: a dialog is portalled, but React still routes a
          // submit up its own tree, and this one may open from inside another form.
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSend();
          }}
          noValidate
        >
          {isError ? (
            <p className="text-sm text-destructive">
              Impossible de préparer ce courriel. Rouvrez la fenêtre pour réessayer.
            </p>
          ) : isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="send-to">
                  Destinataire
                  <RequiredMark />
                </FieldLabel>
                <div className="flex gap-2">
                  <Select
                    // null, not undefined: Base UI reads undefined as an uncontrolled select
                    // and warns when a value later makes it controlled.
                    value={toValue || null}
                    onValueChange={(value) => setTo((value as string | null) ?? "")}
                  >
                    <SelectTrigger id="send-to" className="w-full">
                      {/* These children render even when nothing is selected, so the empty case
                          is handled here — the placeholder prop never gets a turn. */}
                      <SelectValue>
                        {(email: string) =>
                          !email
                            ? "Aucune adresse au dossier"
                            : (() => {
                                const person = options.find((item) => item.email === email);
                                return person ? `${person.name} · ${person.email}` : email;
                              })()
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((person) => (
                        <SelectItem key={person.email} value={person.email}>
                          <span className="flex flex-col text-left">
                            <span>{`${person.name} · ${person.email}`}</span>
                            {person.role && (
                              <span className="text-xs text-muted-foreground">{person.role}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddingContact((current) => !current)}
                  >
                    <Plus />
                    Ajouter un contact
                  </Button>
                </div>
                {options.length === 0 && (
                  <FieldDescription>
                    Ce client n&apos;a aucune adresse au dossier. Ajoutez un contact pour lui
                    écrire.
                  </FieldDescription>
                )}

                {addingContact && (
                  <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">Nouveau contact</p>
                    <p className="text-xs text-muted-foreground">
                      Il sera ajouté aux contacts de {invoice.clientName}, pas seulement à ce
                      courriel.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="send-contact-first">
                          Prénom
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id="send-contact-first"
                          value={contact.firstName}
                          onChange={(event) =>
                            setContact((current) => ({ ...current, firstName: event.target.value }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="send-contact-last">
                          Nom
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id="send-contact-last"
                          value={contact.lastName}
                          onChange={(event) =>
                            setContact((current) => ({ ...current, lastName: event.target.value }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="send-contact-email">
                          Courriel
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id="send-contact-email"
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            setContact((current) => ({ ...current, email: event.target.value }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="send-contact-role">Rôle</FieldLabel>
                        <Input
                          id="send-contact-role"
                          placeholder={ex("Comptabilité")}
                          value={contact.role}
                          onChange={(event) =>
                            setContact((current) => ({ ...current, role: event.target.value }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={saveContact.isPending} onClick={onAddContact}>
                        {saveContact.isPending && <Spinner />}
                        Ajouter le contact
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingContact(false);
                          setContact(emptyContact);
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="send-cc">Copie</FieldLabel>
                {employees.length === 0 ? (
                  <FieldDescription>
                    Aucun employé n&apos;a de courriel au dossier.
                  </FieldDescription>
                ) : (
                  <>
                    {/* A list of boxes rather than a multiple select: a select that holds
                        several answers hides all but one of them behind a trigger. */}
                    <div
                      id="send-cc"
                      className="max-h-40 overflow-y-auto rounded-lg border border-border"
                    >
                      {employees.map((employee) => (
                        <label
                          key={employee.id ?? employee.email}
                          className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={ccIds.includes(employee.id ?? "")}
                            onCheckedChange={() =>
                              setCcIds((current) => toggle(current, employee.id ?? ""))
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {employee.name}
                            <span className="text-muted-foreground">{` · ${employee.email}`}</span>
                          </span>
                          {employee.role && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {employee.role}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <FieldDescription>
                      {ccIds.length === 0
                        ? "Personne en copie."
                        : `${ccIds.length} ${ccIds.length === 1 ? "personne" : "personnes"} en copie.`}
                    </FieldDescription>
                  </>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="send-subject">
                  Sujet
                  <RequiredMark />
                </FieldLabel>
                <Input
                  id="send-subject"
                  value={subjectValue}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="send-body">
                  Message
                  <RequiredMark />
                </FieldLabel>
                <Textarea
                  id="send-body"
                  rows={8}
                  className="font-mono text-xs"
                  value={bodyValue}
                  onChange={(event) => setBody(event.target.value)}
                />
                <FieldDescription>
                  Le gabarit de votre entreprise, déjà rempli. Le message part en HTML : les
                  balises simples comme &lt;p&gt; et &lt;strong&gt; fonctionnent.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Prévisualisation</FieldLabel>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Sujet</p>
                  <p className="text-sm font-medium text-foreground">{subjectValue || "—"}</p>
                  <Separator className="my-3" />
                  {/* dangerouslySetInnerHTML on one condition, which holds here: this markup
                      comes from our own API, which escapes every value it fills in, and is then
                      edited only by the member of staff who is about to send it to their own
                      client. It is never another tenant's text and never a client's. */}
                  <div
                    className="text-sm leading-relaxed text-foreground [&_a]:underline [&_p]:my-2"
                    dangerouslySetInnerHTML={{ __html: bodyValue }}
                  />
                </div>
              </Field>

              <Field>
                <FieldLabel>Pièces jointes</FieldLabel>

                <div className="rounded-lg border border-border">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                    {/* Checked and disabled, not hidden: the invoice is what the message is
                        for, and showing it says so without offering a choice nobody wants. */}
                    <Checkbox checked disabled />
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {`${invoice.title}-${invoice.number}.pdf`}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">Toujours joint</span>
                  </div>

                  {documents.map((document) => (
                    <label
                      key={document.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={documentIds.includes(document.id)}
                        onCheckedChange={() => setDocumentIds((current) => toggle(current, document.id))}
                      />
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {document.title}
                        <span className="text-muted-foreground">{` · ${document.fileName}`}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(document.sizeBytes)}
                      </span>
                    </label>
                  ))}

                  {uploads.map((file) => (
                    <div
                      key={file.mediaAssetId}
                      className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0"
                    >
                      <Checkbox checked disabled />
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{file.fileName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(file.sizeBytes)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Retirer ${file.fileName}`}
                        onClick={() =>
                          setUploads((current) =>
                            current.filter((item) => item.mediaAssetId !== file.mediaAssetId),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>

                <input
                  ref={fileInput}
                  id="send-files"
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) onPick(files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 self-start"
                  disabled={upload.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {upload.isPending ? <Spinner /> : <Upload />}
                  Ajouter des fichiers
                </Button>
                <FieldDescription>
                  {invoice.documentsFrom
                    ? `Les documents ${invoice.documentsFrom} sont au-dessus. Le tout doit tenir sous 20 Mo.`
                    : "Le tout doit tenir sous 20 Mo."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
        </form>

        <DialogFooter>
          <Button
            type="submit"
            form="invoice-send-form"
            disabled={send.isPending || isLoading || !toValue}
          >
            {send.isPending && <Spinner />}
            Envoyer {invoice.noun}
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
