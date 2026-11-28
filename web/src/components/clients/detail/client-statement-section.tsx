"use client";

import { useState } from "react";
import { Download, Send } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { api, ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

interface StatementLine {
  date: string;
  kind: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementOpenInvoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  total: number;
  balance: number;
  daysLate: number;
}

interface ClientStatement {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  from: string;
  to: string;
  openingBalance: number;
  lines: StatementLine[];
  closingBalance: number;
  openInvoices: StatementOpenInvoice[];
  current: number;
  late1To30: number;
  late31To60: number;
  lateOver60: number;
}

function query(from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("du", from);
  if (to) params.set("au", to);
  return params.size > 0 ? `?${params}` : "";
}

/**
 * The client's statement: the balance carried in, every invoice, payment, credit note and
 * refund of the period with the running balance, what is still open by age — and the same on
 * paper, to download or to send by courriel.
 */
export function ClientStatementSection({ clientId }: { clientId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["clients", clientId, "etat-de-compte", from, to],
    queryFn: () => api.get<ClientStatement>(`clients/${clientId}/etat-de-compte${query(from, to)}`),
    placeholderData: (previous) => previous,
  });

  // The period the server settled on, so the PDF and the courriel cover exactly what is shown.
  const shownFrom = data?.from ?? from;
  const shownTo = data?.to ?? to;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">État de compte</h2>
          <p className="text-sm text-muted-foreground">
            Ce que le client doit et comment on y est arrivé : factures, paiements, crédits et remboursements.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-40">
            <FieldLabel htmlFor="statement-from">Du</FieldLabel>
            <Input id="statement-from" type="date" value={shownFrom} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor="statement-to">Au</FieldLabel>
            <Input id="statement-to" type="date" value={shownTo} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <a
            href={`/api/proxy/clients/${clientId}/etat-de-compte/pdf${query(shownFrom, shownTo)}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Download />
            PDF
          </a>
          <Button onClick={() => setSending(true)} disabled={!data}>
            <Send />
            Envoyer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <LoadErrorState
          error={error}
          title="État de compte indisponible"
          fallback="L'état de compte n'a pas pu être calculé."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="space-y-6">
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Solde reporté", value: data.openingBalance },
              { label: "Courant", value: data.current },
              { label: "1 à 30 jours", value: data.late1To30 },
              { label: "31 à 60 jours", value: data.late31To60 },
              { label: "Plus de 60 jours", value: data.lateOver60 },
              { label: "Solde à payer", value: data.closingBalance, strong: true },
            ].map((item) => (
              <div key={item.label} className="bg-card p-3">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className={cn("mt-0.5 tabular-nums", item.strong ? "text-lg font-semibold text-foreground" : "font-medium")}>
                  {formatAmount(item.value)}
                </dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Mouvements de la période</h3>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Débit</TableHead>
                    <TableHead className="text-right">Crédit</TableHead>
                    <TableHead className="text-right">Solde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{data.from}</TableCell>
                    <TableCell className="italic text-muted-foreground">Solde reporté</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{formatAmount(data.openingBalance)}</TableCell>
                  </TableRow>
                  {data.lines.map((line, index) => (
                    <TableRow key={`${line.date}-${line.reference}-${index}`}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{line.date}</TableCell>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.debit ? formatAmount(line.debit) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.credit ? formatAmount(line.credit) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(line.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {data.lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Aucun mouvement sur la période.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Factures à payer</h3>
            {data.openInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune facture à payer.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead className="text-right">Retard</TableHead>
                      <TableHead className="text-right">Solde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.openInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <a href={`/factures/${invoice.id}`} className="underline-offset-4 hover:underline">
                            {invoice.number}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{invoice.issueDate}</TableCell>
                        <TableCell className="text-muted-foreground">{invoice.dueDate}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", invoice.daysLate > 0 && "text-destructive")}>
                          {invoice.daysLate > 0 ? `${invoice.daysLate} j` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatAmount(invoice.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}

      {sending && data && (
        <SendStatementDialog clientId={clientId} statement={data} onClose={() => setSending(false)} />
      )}
    </div>
  );
}

/** The courriel the statement goes out with; the wording is the company's default when left blank. */
function SendStatementDialog({
  clientId,
  statement,
  onClose,
}: {
  clientId: string;
  statement: ClientStatement;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(statement.clientEmail ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () =>
      api.post<{ to: string }>(`clients/${clientId}/etat-de-compte/envoyer`, {
        from: statement.from,
        to: statement.to,
        email: email.trim() || null,
        subject: subject.trim() || null,
        body: body.trim() || null,
      }),
  });

  async function submit() {
    try {
      const result = await send.mutateAsync();
      toast.success(`État de compte envoyé à ${result.to}.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'envoyer l'état de compte.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer l&apos;état de compte</DialogTitle>
          <DialogDescription>
            Du {statement.from} au {statement.to} — solde de {formatAmount(statement.closingBalance)}. Le PDF est joint au
            courriel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4">
          <Field>
            <FieldLabel htmlFor="statement-email">Courriel</FieldLabel>
            <Input id="statement-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="statement-subject">Sujet</FieldLabel>
            <Input
              id="statement-subject"
              value={subject}
              maxLength={200}
              placeholder="État de compte — votre entreprise"
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="statement-body">Message</FieldLabel>
            <Textarea id="statement-body" rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
            <FieldDescription>Laissé vide, le message rappelle la période et le solde à payer.</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={send.isPending || !email.trim()}>
            {send.isPending ? <Spinner /> : <Send />}
            Envoyer l&apos;état de compte
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
