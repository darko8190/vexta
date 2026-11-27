"use client";

import { useState } from "react";
import { Bug, ExternalLink, ImageIcon, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput } from "@/components/layout/search-input";
import { StatusPills } from "@/components/layout/status-pills";
import { FeedbackKindLabel } from "@/components/feedback/feedback-status-badge";
import {
  feedbackKindLabel,
  feedbackStatuses,
  feedbackStatusLabel,
  useAdminFeedbackQuery,
  useRespondFeedback,
  useSetFeedbackStatus,
  type AdminFeedbackRequest,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/hooks/use-feedback";
import { ApiError } from "@/lib/api";
import { formatMoment } from "@/lib/dates";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";

/** Ready-made answers: one press fills the text and the state it usually leaves the request in. */
const presets: { kind: FeedbackKind | "both"; label: string; text: string; status: FeedbackStatus }[] = [
  { kind: "bug", label: "Corrigé", text: "Merci de nous l'avoir signalé ! Le problème est corrigé et la correction est en ligne.", status: "Resolved" },
  { kind: "bug", label: "Correction à venir", text: "Merci ! Nous avons trouvé la cause du problème. La correction sera en ligne dans la prochaine mise à jour.", status: "InProgress" },
  { kind: "bug", label: "Comportement voulu", text: "Merci pour le signalement. Ce comportement est voulu : ", status: "Resolved" },
  { kind: "suggestion", label: "Ajoutée à la liste", text: "Merci pour l'idée ! Elle est ajoutée à notre liste d'améliorations.", status: "InProgress" },
  { kind: "suggestion", label: "Disponible", text: "Bonne nouvelle : cette amélioration est maintenant disponible. Merci de l'avoir proposée !", status: "Resolved" },
  { kind: "suggestion", label: "Pas prévue", text: "Merci pour la suggestion. Elle n'est pas prévue pour le moment, mais nous la gardons en tête.", status: "Resolved" },
  { kind: "suggestion", label: "Existe déjà", text: "Bonne nouvelle, c'est déjà possible : ", status: "Resolved" },
  { kind: "both", label: "Plus de détails", text: "Merci ! Pour nous aider, pouvez-vous nous en dire plus : les étapes suivies et, si possible, une capture d'écran ?", status: "InProgress" },
];

/**
 * Pattern 1 — List / Index.
 *
 * Every bug and suggestion sent from every space. The three state buttons on each row move it
 * along in one press; « Répondre » writes what the sender reads in « Mes demandes ».
 */
export default function AdminFeedbackPage() {
  const { data, isLoading, isError, error, refetch } = useAdminFeedbackQuery();
  const setStatus = useSetFeedbackStatus();
  const [filter, setFilter] = useState<FeedbackStatus | "">("");
  const [search, setSearch] = useState("");
  const [answering, setAnswering] = useState<AdminFeedbackRequest | null>(null);

  const counts = feedbackStatuses.map((s) => ({ status: s, count: (data ?? []).filter((r) => r.status === s).length }));
  const rows = (data ?? []).filter(
    (r) =>
      (!filter || r.status === filter) &&
      matchesSearch(search, r.message, r.senderName, r.senderEmail, r.tenantName, r.response, feedbackKindLabel(r.kind)),
  );

  function changeStatus(row: AdminFeedbackRequest, status: FeedbackStatus) {
    if (row.status === status) return;
    setStatus.mutate(
      { id: row.id, status },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : "Impossible de changer l'état.") },
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Signalements"
        description="Les bogues et les améliorations envoyés par les utilisateurs. L'état et la réponse s'affichent dans leur page « Mes demandes »."
      />

      {data && data.length > 0 && (
        <>
          <StatusPills
            options={feedbackStatuses.map((s) => ({ value: s, label: feedbackStatusLabel(s) }))}
            value={filter}
            onChange={setFilter}
            counts={counts}
            allLabel="Tous"
          />
          <div className="mb-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par message, personne ou entreprise…" />
          </div>
        </>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bug}
          title={search || filter ? "Rien ne correspond" : "Aucun signalement"}
          description="Ce que les utilisateurs envoient avec l'icône d'insecte arrive ici."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">De</TableHead>
                <TableHead>Demande</TableHead>
                <TableHead className="w-72">État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <p className="text-sm font-medium text-foreground">{row.senderName}</p>
                    <a href={`mailto:${row.senderEmail}`} className="block truncate text-xs text-primary hover:underline">
                      {row.senderEmail}
                    </a>
                    {row.tenantName && <p className="truncate text-xs text-muted-foreground">{row.tenantName}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{formatMoment(row.createdAt)}</p>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <FeedbackKindLabel kind={row.kind} />
                    <p className="mt-1 text-sm whitespace-pre-line text-foreground">{row.message}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {row.hasScreenshot && (
                        <a
                          href={`/api/proxy/admin/signalements/${row.id}/capture`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ImageIcon className="size-3.5" />
                          Capture
                        </a>
                      )}
                      {row.pageUrl && /^https?:\/\//.test(row.pageUrl) && (
                        <a
                          href={row.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5 shrink-0" />
                          {new URL(row.pageUrl).pathname}
                        </a>
                      )}
                    </div>
                    {row.response && (
                      <div className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-muted-foreground">
                          Votre réponse{row.respondedAt && ` · ${formatMoment(row.respondedAt)}`}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-foreground">{row.response}</p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <StatusButtons
                      kind={row.kind}
                      value={row.status}
                      onChange={(status) => changeStatus(row, status)}
                      label={`État de la demande de ${row.senderName}`}
                    />
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setAnswering(row)}>
                      <MessageSquareReply />
                      {row.response ? "Modifier la réponse" : "Répondre"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {answering && <RespondDialog request={answering} onClose={() => setAnswering(null)} />}
    </div>
  );
}

/** The three states side by side, the current one lit: one press moves the request. */
function StatusButtons({
  kind,
  value,
  onChange,
  label,
}: {
  kind: FeedbackKind;
  value: FeedbackStatus;
  onChange: (status: FeedbackStatus) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1">
      {feedbackStatuses.map((status) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={value === status}
          onClick={() => onChange(status)}
          className={cn(
            "h-7 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            value === status
              ? status === "Resolved"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : status === "InProgress"
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {feedbackStatusLabel(status, kind)}
        </button>
      ))}
    </div>
  );
}

function RespondDialog({ request, onClose }: { request: AdminFeedbackRequest; onClose: () => void }) {
  const respond = useRespondFeedback();
  const [text, setText] = useState(request.response ?? "");
  // An answer usually closes the request; a preset says otherwise when it does not.
  const [status, setStatus] = useState<FeedbackStatus>(request.response ? request.status : "Resolved");
  const choices = presets.filter((p) => p.kind === request.kind || p.kind === "both");

  function save() {
    respond.mutate(
      { id: request.id, status, response: text.trim() },
      {
        onSuccess: () => {
          toast.success("La réponse est enregistrée.");
          onClose();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Impossible d'enregistrer la réponse."),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !respond.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Répondre à {request.senderName}</DialogTitle>
          <DialogDescription className="line-clamp-3 whitespace-pre-line">{request.message}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Réponses toutes prêtes</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setText(preset.text);
                  setStatus(preset.status);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <FieldDescription>Le texte reste modifiable avant d&apos;enregistrer.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="feedback-response">Réponse</FieldLabel>
          <Textarea
            id="feedback-response"
            rows={5}
            maxLength={5000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ce que la personne lira dans « Mes demandes »."
          />
        </Field>

        <Field>
          <FieldLabel>État après la réponse</FieldLabel>
          <StatusButtons kind={request.kind} value={status} onChange={setStatus} label="État après la réponse" />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={respond.isPending}>
            Annuler
          </Button>
          <Button onClick={save} disabled={respond.isPending}>
            {respond.isPending && <Spinner />}
            Enregistrer la réponse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
