"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPen, IdCard, Inbox, Link2, ListPlus, Mail, Pencil, PenLine, Send, Trash2, Zap } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { FillFormSheet } from "@/components/forms/fill-form-sheet";
import { FormActionsSection } from "@/components/forms/form-actions-section";
import { FormDetailsSection } from "@/components/forms/form-details-section";
import { FormQuestionsSection } from "@/components/forms/form-questions-section";
import { FormSharesList } from "@/components/forms/form-shares-list";
import { FormSubmissionsSection } from "@/components/forms/form-submissions-section";
import { SendFormDialog } from "@/components/forms/send-form-dialog";
import { FormTemplateSheet } from "@/components/forms/form-template-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import { useDeleteForm, useFormPublicLinkQuery, useFormQuery } from "@/hooks/use-forms";

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
    { key: "envois", label: "Envois", icon: Send },
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
          {section === "envois" && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">Envois</h2>
                <p className="text-sm text-muted-foreground">
                  À qui ce formulaire a été envoyé par courriel, et qui l&apos;a rempli.
                </p>
              </div>
              <FormSharesList formId={form.id} />
            </div>
          )}
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

/** Opens the send dialog for this form. Disabled until the link is known, like « Copier le lien ». */
function SendLinkButton({ formId }: { formId: string }) {
  const { data: link } = useFormPublicLinkQuery(formId);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" disabled={!link} onClick={() => setOpen(true)}>
        <Mail />
        Envoyer par courriel
      </Button>
      <SendFormDialog open={open} onOpenChange={setOpen} formId={formId} />
    </>
  );
}
