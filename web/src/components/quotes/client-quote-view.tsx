"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ClipboardPen, FolderKanban, X } from "lucide-react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import { PdfViewer } from "@/components/layout/pdf-viewer";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { useQuoteQuery, useRespondToQuote } from "@/hooks/use-quotes";
import { ApiError } from "@/lib/api";
import { formatDateOnly, formatMoment, todayIso } from "@/lib/dates";
import { quoteStatusBadgeVariant, quoteStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, formatQuoteNumber, type QuoteRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DrawnSignature, SignaturePad } from "@/components/quotes/signature-pad";

type Answer = "accepter" | "refuser";

/**
 * A quote as its customer meets it in their portal: the document they were sent, and the two
 * answers they can give. Nothing else — the lines, the costs and the company's own notes are
 * the company's, and the PDF already says everything the customer is agreeing to.
 */
export function ClientQuoteView({ id }: { id: string }) {
  const { data: quote, isLoading, isError } = useQuoteQuery(id);
  const [answering, setAnswering] = useState<Answer | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="Soumission introuvable"
        description="Cette soumission n'existe plus, ou elle ne vous est pas adressée."
        action={
          <Link href="/soumissions" className={cn(buttonVariants())}>
            Retour à mes soumissions
          </Link>
        }
      />
    );
  }

  // The same rule as the API's, so the buttons are not offered for an answer it would refuse.
  const expired = quote.status === "Expiree" || (quote.validUntil != null && quote.validUntil < todayIso());
  const awaiting = quote.status === "Envoyee" && !quote.projectId && !expired;
  const number = formatQuoteNumber(quote.number, quote.revision);

  return (
    <div>
      <Link
        href="/soumissions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Mes soumissions
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{number}</span>
              <Badge variant={quoteStatusBadgeVariant[quote.status]}>{quoteStatusLabels[quote.status]}</Badge>
              {quote.validUntil && (
                <span className="text-xs text-muted-foreground">
                  Valide jusqu&apos;au {formatDateOnly(quote.validUntil)}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {quote.description || `Soumission ${number}`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Total avant taxes :{" "}
              <span className="font-medium text-foreground tabular-nums">{formatAmount(quote.subtotal)}</span>
              {" · "}le détail et les taxes sont dans le document ci-dessous.
            </p>
            {awaiting && quote.options.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {quote.options.length === 1 ? "Une option vous est proposée" : `${quote.options.length} options vous sont proposées`}
                {" "}en plus : vous les choisirez en acceptant.
              </p>
            )}
          </div>

          {awaiting && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setAnswering("refuser")}>
                <X />
                Refuser
              </Button>
              <Button onClick={() => setAnswering("accepter")}>
                <Check />
                Accepter la soumission
              </Button>
            </div>
          )}
        </div>

        <ResponseLine quote={quote} expired={expired} />
      </div>

      <QuoteDocument key={quote.updatedAt} quote={quote} />

      {answering && (
        <AnswerDialog quote={quote} answer={answering} onClose={() => setAnswering(null)} />
      )}
    </div>
  );
}

/** What has become of the quote, in one line under the header. */
function ResponseLine({ quote, expired }: { quote: QuoteRecord; expired: boolean }) {
  let text: React.ReactNode = null;

  if (quote.clientRespondedAt) {
    const verb = quote.status === "Refusee" ? "Refusée" : "Acceptée";
    text = (
      <>
        {verb} le {formatMoment(quote.clientRespondedAt)}
        {quote.clientRespondedBy ? ` par ${quote.clientRespondedBy}` : ""}.
        {quote.clientSignature && (
          <span className="mt-1 block">
            Signée électroniquement au nom de{" "}
            <span className="font-medium text-foreground italic">{quote.clientSignature}</span>.
          </span>
        )}
        {quote.hasDrawnSignature && <DrawnSignature quoteId={quote.id} className="mt-2 block" />}
        {quote.clientResponseNote && (
          <span className="mt-1 block whitespace-pre-line text-foreground">« {quote.clientResponseNote} »</span>
        )}
      </>
    );
  } else if (quote.status === "Remplacee") {
    // The revision may still be a draft the customer cannot open, so the list is where to look.
    text = "Cette version a été remplacée par une soumission révisée. La nouvelle version se trouve dans vos soumissions dès que votre fournisseur vous l'envoie.";
  } else if (quote.status === "Acceptee" || quote.status === "EnProjet") {
    text = "Acceptée. Les travaux sont planifiés avec vous.";
  } else if (quote.status === "Refusee") {
    text = "Refusée.";
  } else if (expired) {
    text = "Cette soumission est expirée. Communiquez avec votre fournisseur pour obtenir un nouveau prix.";
  } else {
    text = "En acceptant, vous autorisez les travaux décrits aux prix indiqués. Vous pouvez aussi la refuser, avec un mot si vous le souhaitez.";
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
      <p className="min-w-0">{text}</p>
      {quote.projectId && quote.projectNumber != null && (
        <Link href={`/projets/${quote.projectId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <FolderKanban />
          Projet {formatProjectNumber(quote.projectNumber)}
        </Link>
      )}
    </div>
  );
}

/** Keyed on the quote's last change, so an answer that changes the paper draws it again. */
function QuoteDocument({ quote }: { quote: QuoteRecord }) {
  const pdf = usePdfDocument(`soumissions/${quote.id}/pdf`);
  const number = formatQuoteNumber(quote.number, quote.revision);
  return (
    <PdfViewer
      url={pdf.url}
      loading={pdf.loading}
      error={pdf.error}
      title={`Soumission ${number}`}
      fileName={`Soumission-${number}.pdf`}
    />
  );
}

function AnswerDialog({ quote, answer, onClose }: { quote: QuoteRecord; answer: Answer; onClose: () => void }) {
  const respond = useRespondToQuote();
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const accepting = answer === "accepter";
  // The total the customer is agreeing to: the base, plus the options ticked here.
  const total =
    quote.subtotal + quote.options.filter((option) => chosen.includes(option.id)).reduce((sum, option) => sum + option.total, 0);
  const deposit = quote.depositPercent ? Math.round(total * quote.depositPercent) / 100 : null;
  // The name typed and the signature drawn: the button waits for both.
  const signed = signature.trim().length >= 2 && drawn !== null;
  const number = formatQuoteNumber(quote.number, quote.revision);

  async function submit() {
    try {
      await respond.mutateAsync({
        id: quote.id,
        answer,
        note: note.trim() || null,
        signature: accepting ? signature.trim() : null,
        signatureImage: accepting ? drawn : null,
        optionIds: accepting ? chosen : [],
      });
      toast.success(
        accepting
          ? `Soumission ${number} acceptée. Votre fournisseur en est avisé.`
          : `Soumission ${number} refusée. Votre fournisseur en est avisé.`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Votre réponse n'a pas pu être enregistrée. Réessayez.");
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{accepting ? `Accepter la soumission ${number} ?` : `Refuser la soumission ${number} ?`}</DialogTitle>
          <DialogDescription>
            {accepting
              ? `Vous autorisez les travaux qu'elle décrit, au montant de ${formatAmount(total)} avant taxes. Votre fournisseur en est avisé et planifie la suite avec vous.${
                  deposit != null ? ` Un acompte de ${quote.depositPercent} % (${formatAmount(deposit)} avant taxes) vous sera facturé.` : ""
                }`
              : "Votre fournisseur en est avisé. Dites-lui pourquoi si vous le souhaitez : il pourra vous proposer autre chose."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4">
          {accepting && quote.options.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Options proposées</legend>
              {quote.options.map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`quote-option-${option.id}`}
                    checked={chosen.includes(option.id)}
                    onCheckedChange={(checked) =>
                      setChosen((current) =>
                        checked === true ? [...current, option.id] : current.filter((id) => id !== option.id),
                      )
                    }
                  />
                  <label htmlFor={`quote-option-${option.id}`} className="flex min-w-0 flex-1 justify-between gap-3 text-sm">
                    <span className="min-w-0">{option.description}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">+ {formatAmount(option.total)}</span>
                  </label>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Cochez celles que vous voulez ; le montant ci-dessus suit votre choix.</p>
            </fieldset>
          )}
          {accepting && (
            <Field>
              <FieldLabel htmlFor="quote-answer-signature">Votre nom complet</FieldLabel>
              <Input
                id="quote-answer-signature"
                autoComplete="name"
                maxLength={200}
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                className="italic"
              />
            </Field>
          )}
          {accepting && (
            <Field>
              <FieldLabel>Votre signature</FieldLabel>
              <SignaturePad onChange={setDrawn} />
              <FieldDescription>
                En signant, vous acceptez la soumission. Votre signature, votre nom, la date et
                l&apos;heure s&apos;impriment sur la soumission.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="quote-answer-note">Message (facultatif)</FieldLabel>
            <Textarea
              id="quote-answer-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <FieldDescription>
              {accepting ? "Une précision pour la suite, par exemple vos disponibilités." : "Le prix, le délai, autre chose…"}
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant={accepting ? "default" : "destructive"} disabled={respond.isPending || (accepting && !signed)} onClick={submit}>
            {respond.isPending && <Spinner />}
            {accepting ? "Signer et accepter" : "Refuser la soumission"}
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
