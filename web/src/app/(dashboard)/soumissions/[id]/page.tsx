"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  BellRing,
  BookmarkPlus,
  ClipboardPen,
  Copy,
  FolderKanban,
  FileText,
  FolderOpen,
  HardHat,
  Info,
  ListChecks,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InlineSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { InvoiceSendDialog } from "@/components/invoices/invoice-send-dialog";
import { PdfViewer } from "@/components/layout/pdf-viewer";
import { ProjectCostTable } from "@/components/projects/detail/project-cost-table";
import { useCanManage, useIsClientUser } from "@/hooks/use-can-create";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { ProjectDocumentsSection } from "@/components/projects/detail/project-documents-section";
import { ClientQuoteView } from "@/components/quotes/client-quote-view";
import { QuoteFormSheet } from "@/components/quotes/quote-form-sheet";
import { QuoteLinesSection } from "@/components/quotes/quote-lines-section";
import {
  useConvertQuote,
  useDeleteQuote,
  useDuplicateQuote,
  useQuoteQuery,
  useQuoteSummaryQuery,
  useSaveQuoteAsTemplate,
} from "@/hooks/use-quotes";
import { ex } from "@/lib/placeholders";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { formatDateOnly, formatMoment } from "@/lib/dates";
import { quoteStatusBadgeVariant, quoteStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, formatQuoteNumber, type QuoteRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One quote, laid out like a project because it is the project before it is sold: its details
 * editable in place, then its tasks, materials and extra charges, and the money they add up to.
 * Convertir en projet carries all of it over and freezes the quote.
 *
 * A customer opening the same address gets their own view instead: the document and their two
 * answers. Split at the top so neither one asks for what the other may not read.
 */
export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isClient = useIsClientUser();
  return isClient ? <ClientQuoteView id={id} /> : <StaffQuoteDetail id={id} />;
}

function StaffQuoteDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: quote, isLoading, isError } = useQuoteQuery(id);
  const { data: summary, isLoading: summaryLoading } = useQuoteSummaryQuery(id);
  const convert = useConvertQuote();
  const remove = useDeleteQuote();
  const duplicate = useDuplicateQuote();
  const canManage = useCanManage();
  const [section, setSection] = useState("details");
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="Soumission introuvable"
        description="Cette soumission n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/soumissions" className={cn(buttonVariants())}>
            Retour aux soumissions
          </Link>
        }
      />
    );
  }

  const locked = Boolean(quote.projectId);
  const canConvert = !locked && quote.status !== "Refusee" && quote.status !== "Expiree";
  // Out with the client and not answered yet: the next message is a reminder, not a copy.
  const awaiting = quote.status === "Envoyee" && !locked && Boolean(quote.sentAt);

  function openSend(reminder: boolean) {
    setReminding(reminder);
    setSending(true);
  }

  async function onDuplicate() {
    try {
      const copy = await duplicate.mutateAsync(id);
      toast.success(`Soumission ${formatQuoteNumber(copy.number)} créée, en brouillon.`);
      router.push(`/soumissions/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de dupliquer la soumission.");
    }
  }

  const sections: NavSection[] = [
    { key: "details", label: "Détails", icon: Info },
    { key: "taches", label: "Tâches", count: summary?.tasks ?? 0, icon: ListChecks },
    { key: "materiaux", label: "Matériaux", count: summary?.materials ?? 0, icon: HardHat },
    { key: "frais", label: "Frais supplémentaires", count: summary?.extraCharges ?? 0, icon: Plus },
    // The paper the client receives, drawn by the same code that attaches it to the email.
    { key: "apercu", label: "Aperçu PDF", icon: FileText },
    {
      key: "documents",
      label: "Documents et notes",
      count: summary?.documentsAndNotes ?? 0,
      icon: FolderOpen,
    },
  ];

  async function onConvert() {
    try {
      const updated = await convert.mutateAsync(id);
      toast.success(
        updated.projectNumber != null
          ? `Projet ${formatProjectNumber(updated.projectNumber)} créé à partir de la soumission.`
          : "Projet créé.",
      );
      setConfirmConvert(false);
      if (updated.projectId) router.push(`/projets/${updated.projectId}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de convertir la soumission.");
    }
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success("Soumission supprimée.");
      router.push("/soumissions");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer la soumission.");
    }
  }

  return (
    <div>
      <Link
        href="/soumissions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Soumissions
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatQuoteNumber(quote.number)}
              </span>
              <Badge variant={quoteStatusBadgeVariant[quote.status]}>{quoteStatusLabels[quote.status]}</Badge>
              {quote.isTaxExempt && <Badge variant="outline">Non taxable</Badge>}
              {quote.sentAt && (
                <span className="text-xs text-muted-foreground">
                  Envoyée le {formatMoment(quote.sentAt)}
                </span>
              )}
              {quote.validUntil && (
                <span className="text-xs text-muted-foreground">
                  Valide jusqu&apos;au {formatDateOnly(quote.validUntil)}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              <Link href={`/clients/${quote.clientId}`} className="underline-offset-4 hover:underline">
                {quote.clientName}
              </Link>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Total avant taxes :{" "}
              <span className="font-medium text-foreground tabular-nums">{formatAmount(quote.subtotal)}</span>
              {quote.optionsTotal > 0 && (
                <span> · options proposées en plus : {formatAmount(quote.optionsTotal)}</span>
              )}
              {quote.depositPercent != null && <span> · acompte de {quote.depositPercent} %</span>}
            </p>
            {quote.depositInvoiceId && quote.depositInvoiceNumber && (
              <p className="mt-1 text-sm text-muted-foreground">
                Facture d&apos;acompte :{" "}
                <Link href={`/factures/${quote.depositInvoiceId}`} className="text-foreground underline-offset-4 hover:underline">
                  {quote.depositInvoiceNumber}
                </Link>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {awaiting ? (
              <Button variant="outline" size="sm" onClick={() => openSend(true)}>
                <BellRing />
                Relancer
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => openSend(false)}>
                <Send />
                {quote.sentAt ? "Renvoyer" : "Envoyer"}
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" disabled={duplicate.isPending} onClick={onDuplicate}>
                {duplicate.isPending ? <Spinner /> : <Copy />}
                Dupliquer
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setSavingTemplate(true)}>
                <BookmarkPlus />
                Enregistrer comme modèle
              </Button>
            )}
            {quote.projectId && quote.projectNumber != null ? (
              <Link href={`/projets/${quote.projectId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <FolderKanban />
                Projet {formatProjectNumber(quote.projectNumber)}
              </Link>
            ) : (
              canConvert && (
                <Button size="sm" onClick={() => setConfirmConvert(true)}>
                  <ArrowRightLeft />
                  Convertir en projet
                </Button>
              )
            )}
            <Button variant="outline" size="icon-sm" aria-label="Supprimer la soumission" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </div>
        </div>

        {quote.clientRespondedAt && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
            {quote.status === "Refusee" ? "Refusée" : "Acceptée"} par le client depuis son portail le{" "}
            {formatMoment(quote.clientRespondedAt)}
            {quote.clientRespondedBy ? ` (${quote.clientRespondedBy})` : ""}.
            {quote.clientSignature && (
              <span className="mt-1 block">
                Signée électroniquement au nom de{" "}
                <span className="font-medium text-foreground italic">{quote.clientSignature}</span>.
              </span>
            )}
            {quote.clientResponseNote && (
              <span className="mt-1 block whitespace-pre-line text-foreground">« {quote.clientResponseNote} »</span>
            )}
          </p>
        )}

        {locked && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Acceptée et devenue un projet : ses lignes et ses prix ne changent plus. La description,
            les dates et les adresses restent corrigeables.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav sections={sections} active={section} onSelect={setSection} label="Sections de la soumission" />

        <div className="min-w-0 flex-1">
          {section === "details" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Détails</h2>
                <p className="text-sm text-muted-foreground">Modifiez les champs directement, puis enregistrez.</p>
              </div>
              <InlineSheet>
                <QuoteFormSheet open onOpenChange={() => {}} quote={quote} />
              </InlineSheet>
              <ProjectCostTable costs={summary?.costs} isLoading={summaryLoading} />
            </div>
          )}
          {section === "taches" && (
            <QuoteLinesSection
              quoteId={quote.id}
              kind="Tache"
              icon={ListChecks}
              locked={locked}
              wageClassificationId={quote.wageClassificationId}
            />
          )}
          {section === "materiaux" && (
            <QuoteLinesSection
              quoteId={quote.id}
              kind="Materiel"
              icon={HardHat}
              locked={locked}
              wageClassificationId={quote.wageClassificationId}
            />
          )}
          {/* The same tab as a project's, pointed at the quote: they are carried over together
              when it is accepted. */}
          {section === "apercu" && <QuotePdfPreview key={quote.updatedAt} quote={quote} />}
          {section === "documents" && (
            <ProjectDocumentsSection projectId={{ kind: "soumissions", id: quote.id }} />
          )}
          {section === "frais" && (
            <QuoteLinesSection
              quoteId={quote.id}
              kind="Frais"
              icon={Plus}
              locked={locked}
              wageClassificationId={quote.wageClassificationId}
            />
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette soumission ?"
        description={`La soumission ${formatQuoteNumber(quote.number)} et ses lignes seront supprimées.${quote.projectId ? " Le projet qui en est issu reste en place." : ""}`}
        onConfirm={onDelete}
        pending={remove.isPending}
      />

      {/* Not a deletion, but the same shape of question: one deliberate press for a step that
          creates a project and freezes the quote. */}
      <InvoiceSendDialog
        // Remounted when the kind of message changes, so a reminder never opens over a draft
        // of the first message.
        key={reminding ? "relance" : "envoi"}
        open={sending}
        onOpenChange={setSending}
        quote={quote}
        reminder={reminding}
      />

      {savingTemplate && <SaveTemplateDialog quote={quote} onClose={() => setSavingTemplate(false)} />}

      <ConvertDialog open={confirmConvert} onOpenChange={setConfirmConvert} onConfirm={onConvert} pending={convert.isPending} />
    </div>
  );
}

/** Keyed on the quote's last change by the page, so an edited quote is drawn again. */
function QuotePdfPreview({ quote }: { quote: QuoteRecord }) {
  const pdf = usePdfDocument(`soumissions/${quote.id}/pdf`);
  const number = formatQuoteNumber(quote.number);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Aperçu PDF</h2>
        <p className="text-sm text-muted-foreground">Le document que le client recevra en pièce jointe.</p>
      </div>
      <PdfViewer
        url={pdf.url}
        loading={pdf.loading}
        error={pdf.error}
        title={`Soumission ${number}`}
        fileName={`Soumission-${number}.pdf`}
      />
    </div>
  );
}

function ConvertDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convertir en projet ?</AlertDialogTitle>
          <AlertDialogDescription>
            Un projet est créé avec le même client, les mêmes adresses et le même actif. Les tâches,
            les matériaux et les frais y sont repris aux prix soumis, et le total devient le budget.
            La soumission passe à « Acceptée » et ses lignes ne changent plus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            Créer le projet
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Names the template the quote's lines are kept as. Saving under a name already used replaces
 * that template, which is how a template is updated.
 */
function SaveTemplateDialog({ quote, onClose }: { quote: QuoteRecord; onClose: () => void }) {
  const save = useSaveQuoteAsTemplate();
  const [name, setName] = useState(quote.description?.split(/\r?\n/)[0]?.slice(0, 80) ?? "");

  async function submit() {
    try {
      const template = await save.mutateAsync({ id: quote.id, name: name.trim() });
      toast.success(`Modèle « ${template.name} » enregistré.`, {
        description: "Choisissez-le dans « Partir d'un modèle » en créant une soumission.",
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le modèle.");
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer comme modèle</DialogTitle>
          <DialogDescription>
            Les lignes de cette soumission, sa description et son acompte sont gardés pour en
            créer d&apos;autres. Un nom déjà utilisé remplace ce modèle.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4">
          <Field>
            <FieldLabel htmlFor="quote-template-name">Nom du modèle</FieldLabel>
            <Input
              id="quote-template-name"
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder={ex("Réfection de toiture")}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" disabled={save.isPending || name.trim().length === 0} onClick={submit}>
            {save.isPending && <Spinner />}
            Enregistrer le modèle
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
