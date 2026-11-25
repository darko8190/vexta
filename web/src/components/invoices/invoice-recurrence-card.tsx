"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import {
  type RecurringInvoice,
  recurrenceIntervals,
  recurrenceLabel,
  useDeleteRecurringInvoice,
  useRecurringInvoicesQuery,
  useSaveRecurringInvoice,
} from "@/hooks/use-recurring-invoices";
import { ApiError } from "@/lib/api";
import { dayIso, formatDateOnly, todayIso } from "@/lib/dates";

/**
 * Makes this invoice come back on a schedule, or shows the schedule it already has. Each
 * period a copy is issued — left as a draft to check, or sent to the client on its own.
 */
export function InvoiceRecurrenceCard({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const { data, isLoading } = useRecurringInvoicesQuery(invoiceId);
  const remove = useDeleteRecurringInvoice();
  const [editing, setEditing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const recurrence = data?.[0];

  async function stop() {
    if (!recurrence) return;
    try {
      await remove.mutateAsync(recurrence.id);
      toast.success("Récurrence arrêtée. Les factures déjà émises restent.");
      setStopping(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'arrêter la récurrence.");
    }
  }

  if (isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="size-4" />
          Récurrence
          {recurrence && !recurrence.isActive && <Badge variant="outline">Terminée</Badge>}
        </CardTitle>
        <CardDescription>
          {recurrence
            ? `${recurrenceLabel(recurrence.intervalMonths)}, une copie de cette facture ${
                recurrence.autoSend ? "envoyée au client automatiquement" : "créée en brouillon à vérifier"
              }.`
            : "Pour un contrat d'entretien ou un service au mois : une copie de cette facture revient toute seule à chaque période."}
        </CardDescription>
        <CardAction>
          {recurrence ? (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                Modifier
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Arrêter la récurrence"
                className="text-destructive"
                onClick={() => setStopping(true)}
              >
                <Trash2 />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Repeat />
              Rendre récurrente
            </Button>
          )}
        </CardAction>
      </CardHeader>
      {recurrence && <RecurrenceFacts recurrence={recurrence} />}

      {editing && (
        <RecurrenceDialog
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          recurrence={recurrence}
          onClose={() => setEditing(false)}
        />
      )}

      <ConfirmDeleteDialog
        open={stopping}
        onOpenChange={setStopping}
        title="Arrêter la récurrence ?"
        description="Aucune nouvelle facture ne sera créée. Celles déjà émises restent comme elles sont."
        onConfirm={stop}
        pending={remove.isPending}
      />
    </Card>
  );
}

function RecurrenceFacts({ recurrence }: { recurrence: RecurringInvoice }) {
  return (
    <CardContent className="space-y-3">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Prochaine facture</dt>
          <dd className="text-foreground">
            {recurrence.isActive ? formatDateOnly(recurrence.nextIssueDate) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fin</dt>
          <dd className="text-foreground">
            {recurrence.endDate ? formatDateOnly(recurrence.endDate) : "Jusqu'à l'arrêt"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dernière émise</dt>
          <dd className="text-foreground">
            {recurrence.lastInvoiceId && recurrence.lastInvoiceNumber ? (
              <Link
                href={`/factures/${recurrence.lastInvoiceId}`}
                className="font-mono text-xs underline-offset-4 hover:underline"
              >
                {recurrence.lastInvoiceNumber}
              </Link>
            ) : (
              "Aucune encore"
            )}
          </dd>
        </div>
      </dl>
      {recurrence.lastProblem && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {recurrence.lastProblem}
        </p>
      )}
    </CardContent>
  );
}

export function RecurrenceDialog({
  invoiceId,
  invoiceNumber,
  recurrence,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  recurrence?: RecurringInvoice;
  onClose: () => void;
}) {
  const save = useSaveRecurringInvoice();
  const [interval, setIntervalMonths] = useState(String(recurrence?.intervalMonths ?? 1));
  const [next, setNext] = useState(
    recurrence?.isActive && recurrence.nextIssueDate >= todayIso() ? recurrence.nextIssueDate : dayIso(30),
  );
  const [end, setEnd] = useState(recurrence?.endDate ?? "");
  const [autoSend, setAutoSend] = useState(recurrence?.autoSend ?? false);

  const nextValid = Boolean(next) && next >= todayIso();
  const endValid = !end || end >= next;

  async function submit() {
    try {
      await save.mutateAsync({
        id: recurrence?.id,
        values: {
          sourceInvoiceId: invoiceId,
          intervalMonths: Number(interval),
          nextIssueDate: next,
          endDate: end || null,
          autoSend,
        },
      });
      toast.success(recurrence ? "Récurrence enregistrée." : `La facture ${invoiceNumber} est maintenant récurrente.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la récurrence.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{recurrence ? "Modifier la récurrence" : `Rendre la facture ${invoiceNumber} récurrente`}</DialogTitle>
          <DialogDescription>
            À chaque période, une nouvelle facture reprend le client, les lignes et les taxes de
            celle-ci, avec son propre numéro et l&apos;échéance de vos paramètres.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="recurrence-interval">Fréquence</FieldLabel>
                <Select value={interval} onValueChange={(value) => setIntervalMonths(value ?? "1")}>
                  <SelectTrigger id="recurrence-interval" className="w-full">
                    <SelectValue>{(value: string) => recurrenceLabel(Number(value))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {recurrenceIntervals.map((months) => (
                      <SelectItem key={months} value={String(months)}>
                        {recurrenceLabel(months)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="recurrence-next">Prochaine facture le</FieldLabel>
                <Input
                  id="recurrence-next"
                  type="date"
                  min={todayIso()}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  aria-invalid={!nextValid}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="recurrence-end">Dernière facture au plus tard le</FieldLabel>
              <Input
                id="recurrence-end"
                type="date"
                min={next}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                aria-invalid={!endValid}
              />
              <FieldDescription>
                {endValid ? "Facultatif : laissez vide pour continuer jusqu'à ce que vous l'arrêtiez." : "La fin doit suivre la prochaine facture."}
              </FieldDescription>
            </Field>
            <Field>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="recurrence-autosend"
                  checked={autoSend}
                  onCheckedChange={(checked) => setAutoSend(checked === true)}
                />
                <div className="space-y-1">
                  <FieldLabel htmlFor="recurrence-autosend" className="font-normal">
                    L&apos;envoyer au client automatiquement
                  </FieldLabel>
                  <FieldDescription>
                    Avec votre message habituel, le PDF et le paiement en ligne si vous l&apos;offrez.
                    Sinon, elle est créée en brouillon pour que vous la vérifiiez.
                  </FieldDescription>
                </div>
              </div>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={save.isPending || !nextValid || !endValid}>
            {save.isPending && <Spinner />}
            {recurrence ? "Enregistrer" : "Rendre récurrente"}
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
