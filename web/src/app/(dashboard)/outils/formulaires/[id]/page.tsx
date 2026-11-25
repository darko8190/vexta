"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPen, IdCard, Inbox, Link2, ListPlus, Mail, Pencil, PenLine, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { FillFormSheet } from "@/components/forms/fill-form-sheet";
import { FormActionsSection } from "@/components/forms/form-actions-section";
import { FormDetailsSection } from "@/components/forms/form-details-section";
import { FormQuestionsSection } from "@/components/forms/form-questions-section";
import { FormSubmissionsSection } from "@/components/forms/form-submissions-section";
import { FormTemplateSheet } from "@/components/forms/form-template-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import { useDeleteForm, useFormPublicLinkQuery, useFormQuery, useSendFormLink } from "@/hooks/use-forms";

/**
 * Pattern 2 — Detail / Record: one form, with its questions, its actions and its replies in the
 * rail, the same shape as a project or a client.
 *
 * The three sections are the three questions somebody has about a form, in the order they ask
 * them: what does it ask, what does it do, and what has come back.
 */
export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canManage = useCanManage();
  const { data, isLoading } = useFormQuery(id);
  const router = useRouter();
  const remove = useDeleteForm();

  const [section, setSection] = useState("details");
  const [editOpen, setEditOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success("Formulaire supprimé.");
      router.push("/outils");
    } catch (error) {
      // The API refuses a form that has been filled and says so with the count: the answers are
      // a record of what a crew reported, and the way to retire a form is to unpublish it.
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de supprimer ce formulaire.",
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="Formulaire introuvable"
        description="Il a peut-être été supprimé."
        action={
          <Link href="/outils" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Retour aux outils
          </Link>
        }
      />
    );
  }

  const { form, fields, actions } = data;

  const sections: NavSection[] = [
    // First and the one the page opens on: somebody arriving from the list came to see what this
    // form is, not necessarily to rewrite a question.
    { key: "details", label: "Détails", icon: IdCard },
    { key: "questions", label: "Questions", count: fields.length, icon: ListPlus },
    { key: "actions", label: "Actions", count: actions.length, icon: Zap },
    { key: "reponses", label: "Réponses", count: form.submissionCount, icon: Inbox },
  ];

  return (
    <div>
      <Link
        href="/outils"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Outils & Formation
      </Link>

      <PageHeader
        title={form.title}
        description={form.description ?? "Les questions, les actions et les réponses."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Only a published form can be filled, so only a published form offers it. */}
            {form.isPublished && (
              <Button variant="outline" onClick={() => setFillOpen(true)}>
                <PenLine />
                Remplir
              </Button>
            )}
            <CopyLinkButton formId={form.id} />
            <SendLinkButton formId={form.id} />
            {canManage && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                Modifier la fiche
              </Button>
            )}
            {/* Here rather than on the list: deleting a record belongs on the record, where the
                person can see what they are about to remove. */}
            {canManage && (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                Supprimer
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {form.isPublished ? (
          <Badge variant="secondary">Publié</Badge>
        ) : (
          <Badge variant="outline">Brouillon</Badge>
        )}
        {/* Said where it can be acted on: the switch is in the fiche, one button away. */}
        {!form.isPublished && (
          <span className="text-sm text-muted-foreground">
            Vos employés ne le voient pas encore. Publiez-le depuis « Modifier la fiche » quand il
            est prêt.
          </span>
        )}
      </div>

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections du formulaire"
        />

        <div className="min-w-0 flex-1">
          {section === "details" && <FormDetailsSection form={form} />}

          {/* Keyed on the moment the form was last saved: a save remounts the editor on the
              list that came back, and a background refetch that changes nothing leaves whatever
              is being typed exactly where it is. */}
          {section === "questions" && (
            <FormQuestionsSection
              key={form.updatedAt}
              formId={form.id}
              fields={fields}
              canManage={canManage}
            />
          )}
          {section === "actions" && (
            <FormActionsSection
              key={form.updatedAt}
              formId={form.id}
              actions={actions}
              canManage={canManage}
            />
          )}
          {section === "reponses" && <FormSubmissionsSection formId={form.id} />}
        </div>
      </div>

      <FormTemplateSheet open={editOpen} onOpenChange={setEditOpen} template={form} />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer ce formulaire ?"
        description={`« ${form.title} » et ses questions seront supprimés. Si des réponses y sont rattachées, dépubliez-le plutôt : les réponses sont le compte rendu de ce qui a été observé.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
      <FillFormSheet open={fillOpen} onOpenChange={setFillOpen} formId={form.id} />
    </div>
  );
}

/**
 * Copies the address where a client or a stranger fills this form: its own page, /f/{id}, which
 * needs no public page. The API only gives a path when the form can be filled from it, so a
 * copied link always works.
 *
 * When there is no link yet, a dialog says so and names the missing step. A passing toast was
 * not enough: it was missed, and whatever was already on the clipboard got pasted as if it were
 * this form's link.
 */
function CopyLinkButton({ formId }: { formId: string }) {
  const { data: link } = useFormPublicLinkQuery(formId);
  // Either the reason there is no link, or a link the clipboard refused to take.
  const [shown, setShown] = useState<{ missing: string } | { url: string } | null>(null);

  async function copy() {
    if (!link) return;
    if (!link.path) {
      setShown({ missing: link.missing ?? "Ce formulaire n'a pas encore de lien public." });
      return;
    }
    const url = `${window.location.origin}${link.path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié.", { description: url });
    } catch {
      // Clipboard refused (a browser setting): the link is shown to copy by hand.
      setShown({ url });
    }
  }

  return (
    <>
      <Button variant="outline" disabled={!link} onClick={copy}>
        <Link2 />
        Copier le lien
      </Button>

      <Dialog open={shown !== null} onOpenChange={(next) => !next && setShown(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {shown && "missing" in shown ? "Ce formulaire n'a pas encore de lien" : "Lien du formulaire"}
            </DialogTitle>
            <DialogDescription>
              {shown && "missing" in shown
                ? `${shown.missing} Rien n'a été copié.`
                : "Votre navigateur n'a pas permis la copie. Sélectionnez le lien et copiez-le."}
            </DialogDescription>
          </DialogHeader>
          {shown && "url" in shown && (
            <div className="px-4">
              <Input readOnly value={shown.url} aria-label="Lien du formulaire" onFocus={(event) => event.target.select()} autoFocus />
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Fermer</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends the form's link to one person, from the company's name. The address is typed rather than
 * picked from the clients: a form often goes to somebody who is not a client yet.
 *
 * When the form cannot be filled by link yet, the dialog names the missing step instead of
 * offering a send that would be refused.
 */
function SendLinkButton({ formId }: { formId: string }) {
  const { data: link } = useFormPublicLinkQuery(formId);
  const send = useSendFormLink();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const showEmailError = touched && !emailValid;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEmail("");
      setMessage("");
      setTouched(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!emailValid) return;
    try {
      const result = await send.mutateAsync({ id: formId, email: email.trim(), message: message.trim() || null });
      // Said here, once, because it decides whose record the answers land on.
      toast.success("Formulaire envoyé.", {
        description: !result.filesOnClient
          ? email.trim()
          : result.clientName
            ? `Les réponses iront au dossier de ${result.clientName}, sans connexion.`
            : "Cette adresse n'est celle d'aucun client : la personne devra se connecter pour le remplir.",
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Le formulaire n'a pas pu être envoyé.");
    }
  }

  return (
    <>
      <Button variant="outline" disabled={!link} onClick={() => onOpenChange(true)}>
        <Mail />
        Envoyer par courriel
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          {link && !link.path ? (
            <>
              <DialogHeader>
                <DialogTitle>Ce formulaire ne peut pas encore être envoyé</DialogTitle>
                <DialogDescription>{link.missing ?? "Ce formulaire n'a pas encore de lien."}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Fermer</DialogClose>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <DialogHeader>
                <DialogTitle>Envoyer le formulaire</DialogTitle>
                <DialogDescription>
                  La personne reçoit un courriel au nom de votre entreprise, avec un bouton pour
                  remplir le formulaire. Si l&apos;adresse est celle d&apos;un de vos clients, ce
                  qu&apos;elle remplit va à son dossier sans qu&apos;elle ait à se connecter.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="px-4 py-4">
                <Field data-invalid={showEmailError || undefined}>
                  <FieldLabel htmlFor="send-form-email">Courriel</FieldLabel>
                  <Input
                    id="send-form-email"
                    type="email"
                    autoComplete="off"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={showEmailError}
                  />
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
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
                <Button type="submit" disabled={send.isPending}>
                  {send.isPending && <Spinner />}
                  Envoyer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
