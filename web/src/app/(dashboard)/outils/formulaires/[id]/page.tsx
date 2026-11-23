"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardPen, Inbox, ListPlus, Pencil, PenLine, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { FillFormSheet } from "@/components/forms/fill-form-sheet";
import { FormActionsSection } from "@/components/forms/form-actions-section";
import { FormQuestionsSection } from "@/components/forms/form-questions-section";
import { FormSubmissionsSection } from "@/components/forms/form-submissions-section";
import { FormTemplateSheet } from "@/components/forms/form-template-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { useFormQuery } from "@/hooks/use-forms";

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

  const [section, setSection] = useState("questions");
  const [editOpen, setEditOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);

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
            {canManage && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                Modifier la fiche
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
      <FillFormSheet open={fillOpen} onOpenChange={setFillOpen} formId={form.id} />
    </div>
  );
}
