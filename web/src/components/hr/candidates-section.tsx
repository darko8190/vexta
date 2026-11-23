"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, Mail, MoreHorizontal, Paperclip, Pencil, Phone, Plus, Trash2, Upload, UserPlus, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SearchInput } from "@/components/layout/search-input";
import {
  useCandidatesQuery,
  useDeleteCandidate,
  useHireCandidate,
  useSaveCandidate,
} from "@/hooks/use-employee-file";
import { useMediaLink, useUploadMedia } from "@/hooks/use-media";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api";
import { candidateStatusBadgeVariant, candidateStatusLabels } from "@/lib/labels";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { ex } from "@/lib/placeholders";
import { useJobPostingsQuery } from "@/hooks/use-job-postings";
import type { Candidate, CandidateStatus } from "@/lib/types";

/** Embauché is never chosen: it is what hiring does, and offering it would make it a claim. */
const choosableStatuses: CandidateStatus[] = ["Nouveau", "Entrevue", "Offre", "Refuse", "Retire"];

/** The value the "no posting" row carries: a Select cannot hold null as an item value. */
const NO_POSTING = "aucune";

function CandidateFormSheet({
  open,
  onOpenChange,
  candidate,
  defaultJobPostingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate?: Candidate;
  /** Pre-selected when the sheet was opened from one posting's own list. */
  defaultJobPostingId?: string;
}) {
  const isEditing = Boolean(candidate);
  const save = useSaveCandidate();
  const upload = useUploadMedia();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const [firstName, setFirstName] = useState(candidate?.firstName ?? "");
  const [lastName, setLastName] = useState(candidate?.lastName ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(candidate?.desiredJobTitle ?? "");
  const [source, setSource] = useState(candidate?.source ?? "");
  const [status, setStatus] = useState<CandidateStatus>(candidate?.status ?? "Nouveau");
  const [appliedOn, setAppliedOn] = useState(candidate?.appliedOn ?? todayIso());
  const [notes, setNotes] = useState(candidate?.notes ?? "");
  const [jobPostingId, setJobPostingId] = useState(
    candidate?.jobPostingId ?? defaultJobPostingId ?? NO_POSTING,
  );

  // Only the postings still worth attaching somebody to. A filled position keeps the
  // applications it already drew, but a new CV does not belong on it.
  const { data: postings } = useJobPostingsQuery();
  const openPostings = (postings ?? []).filter(
    (posting) =>
      posting.status === "Publiee" ||
      posting.status === "Brouillon" ||
      posting.id === candidate?.jobPostingId,
  );

  async function onSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Le prénom et le nom sont obligatoires.");
      return;
    }

    try {
      const resumeId = file ? (await upload.mutateAsync(file)).id : candidate?.resumeMediaAssetId ?? null;

      await save.mutateAsync({
        id: candidate?.id ?? null,
        values: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          desiredJobTitle: jobTitle.trim() || null,
          source: source.trim() || null,
          status,
          appliedOn: appliedOn || null,
          resumeMediaAssetId: resumeId,
          notes: notes.trim() || null,
          jobPostingId: jobPostingId === NO_POSTING ? null : jobPostingId,
        },
      });

      toast.success(isEditing ? "Candidat mis à jour." : "Candidat ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Impossible d'enregistrer ce candidat.",
      );
    }
  }

  const busy = save.isPending || upload.isPending;
  const hired = Boolean(candidate?.employeeId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le candidat" : "Nouveau candidat"}</SheetTitle>
          <SheetDescription>
            Quelqu&apos;un qui a postulé. Ce n&apos;est pas encore un employé : il ne compte pas
            dans vos accès.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="candidate-first">Prénom</FieldLabel>
                <Input
                  id="candidate-first"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder={ex("Marc")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="candidate-last">Nom</FieldLabel>
                <Input
                  id="candidate-last"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder={ex("Tremblay")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="candidate-email">Courriel</FieldLabel>
                <Input
                  id="candidate-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={ex("marc.tremblay@courriel.ca")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="candidate-phone">Téléphone</FieldLabel>
                <Input
                  id="candidate-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={ex("418 555-0100")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="candidate-job">Poste visé</FieldLabel>
                <Input
                  id="candidate-job"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder={ex("Charpentier-menuisier")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="candidate-source">Provenance</FieldLabel>
                <Input
                  id="candidate-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder={ex("Référé par Marc")}
                />
              </Field>
            </div>

            {openPostings.length > 0 && (
              <Field>
                <FieldLabel htmlFor="candidate-posting">Offre d&apos;emploi</FieldLabel>
                <Select
                  value={jobPostingId}
                  onValueChange={(value) => setJobPostingId(value ?? NO_POSTING)}
                >
                  <SelectTrigger id="candidate-posting" className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === NO_POSTING
                          ? "Candidature spontanée"
                          : openPostings.find((posting) => posting.id === value)?.title ??
                            "Candidature spontanée"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_POSTING}>Candidature spontanée</SelectItem>
                    {openPostings.map((posting) => (
                      <SelectItem key={posting.id} value={posting.id}>
                        {posting.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Ce qui permet de savoir combien de personnes une offre a vraiment attirées.
                </FieldDescription>
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="candidate-status">État</FieldLabel>
                <Select
                  value={status}
                  disabled={hired}
                  onValueChange={(value) => setStatus((value ?? "Nouveau") as CandidateStatus)}
                >
                  <SelectTrigger id="candidate-status" className="w-full">
                    <SelectValue>{(value: CandidateStatus) => candidateStatusLabels[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {choosableStatuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {candidateStatusLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hired && <FieldDescription>Déjà embauché : l&apos;état ne change plus.</FieldDescription>}
              </Field>

              <Field>
                <FieldLabel htmlFor="candidate-applied">Date de candidature</FieldLabel>
                <Input
                  id="candidate-applied"
                  type="date"
                  value={appliedOn}
                  onChange={(event) => setAppliedOn(event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="candidate-resume">CV</FieldLabel>
              <input
                ref={fileInput}
                id="candidate-resume"
                type="file"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload />
                {file || candidate?.resumeFileName ? "Changer le CV" : "Joindre un CV"}
              </Button>
              <FieldDescription>
                {file
                  ? file.name
                  : candidate?.resumeFileName
                    ? `${candidate.resumeFileName} est au dossier.`
                    : "Facultatif. Beaucoup de gens postulent au téléphone."}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="candidate-notes">Notes</FieldLabel>
              <Textarea
                id="candidate-notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={ex("Dix ans en coffrage. Disponible en mai.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le candidat"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Hiring. Creates the employee on file, with no access and no seat spent.
 *
 * Deciding to hire somebody and deciding to give them a login are two decisions, often made by
 * two people on two different days. Doing both here would quietly consume a seat the owner
 * never agreed to.
 */
function HireDialog({
  candidate,
  onOpenChange,
}: {
  candidate: Candidate | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const hire = useHireCandidate();
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [jobTitle, setJobTitle] = useState(candidate?.desiredJobTitle ?? "");

  async function onConfirm() {
    if (!candidate) return;

    if (!email.trim()) {
      toast.error("Un courriel est obligatoire.");
      return;
    }

    try {
      await hire.mutateAsync({ id: candidate.id, values: { email: email.trim(), jobTitle: jobTitle.trim() || null } });
      toast.success("Fiche d'employé créée. L'accès se donne depuis sa fiche, quand vous voudrez.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'embaucher ce candidat.");
    }
  }

  return (
    <Dialog open={Boolean(candidate)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Embaucher {candidate?.firstName} {candidate?.lastName}</DialogTitle>
          <DialogDescription>
            Une fiche d&apos;employé est créée au dossier. Aucun accès n&apos;est donné et aucune
            licence n&apos;est consommée.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="hire-email">Courriel</FieldLabel>
            <Input
              id="hire-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={ex("marc.tremblay@courriel.ca")}
            />
            <FieldDescription>
              C&apos;est l&apos;identifiant si vous lui donnez un accès plus tard.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="hire-job">Poste</FieldLabel>
            <Input
              id="hire-job"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder={ex("Charpentier-menuisier")}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button onClick={onConfirm} disabled={hire.isPending}>
            {hire.isPending && <Spinner />}
            Embaucher
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumeLink({ candidate }: { candidate: Candidate }) {
  const link = useMediaLink();

  if (!candidate.resumeMediaAssetId || !candidate.resumeFileName) return null;

  async function open() {
    try {
      const { url } = await link.mutateAsync(candidate.resumeMediaAssetId!);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Impossible d'ouvrir ce CV.");
    }
  }

  return (
    <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-sm" onClick={open} disabled={link.isPending}>
      <Paperclip className="size-3.5" />
      {candidate.resumeFileName}
    </Button>
  );
}

/** Who applied, newest first. A pile of CVs is worked from the top. */
export function CandidatesSection({
  jobPosting,
  onClearJobPosting,
}: {
  /** Set when the section was opened from one posting's application count. */
  jobPosting?: { id: string; title: string };
  onClearJobPosting?: () => void;
} = {}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading, isError, error, refetch } = useCandidatesQuery(
    debounced,
    undefined,
    jobPosting?.id,
  );
  const remove = useDeleteCandidate();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | undefined>(undefined);
  const [hiring, setHiring] = useState<Candidate | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | undefined>(undefined);

  const formKey = `${editing?.id ?? "nouveau"}-${formOpen}`;

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Candidat retiré.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce candidat.");
    }
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter un candidat
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Candidats</h2>
          <p className="text-sm text-muted-foreground">
            {jobPosting
              ? `Les candidatures reçues pour « ${jobPosting.title} ».`
              : "Qui a postulé, et où chacun est rendu."}
          </p>
        </div>
        {addButton}
      </div>

      {/* Said out loud, with the way out beside it. A filtered list that looks like the whole
          list is how somebody concludes they have three candidates when they have thirty. */}
      {jobPosting && onClearJobPosting && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <Briefcase className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Filtré sur une offre d&apos;emploi
          </span>
          <Button variant="outline" size="sm" onClick={onClearJobPosting}>
            Voir tous les candidats
          </Button>
        </div>
      )}

      <div className="mb-3">
        <Field>
          <FieldLabel htmlFor="candidates-search">Rechercher</FieldLabel>
          <SearchInput
            id="candidates-search"
            value={search}
            onChange={setSearch}
            placeholder="Nom, poste visé ou provenance…"
          />
        </Field>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Candidats indisponibles"
          fallback="Les candidats n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title={debounced ? "Aucun candidat trouvé" : "Aucun candidat"}
          description={
            debounced
              ? "Aucun nom, poste ou provenance ne correspond à cette recherche."
              : "Ajoutez les gens qui postulent : vous les retrouverez quand un poste s'ouvrira."
          }
          action={debounced ? undefined : addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((candidate) => (
            <li
              key={candidate.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {candidate.firstName} {candidate.lastName}
                  </span>
                  <Badge variant={candidateStatusBadgeVariant[candidate.status]}>
                    {candidateStatusLabels[candidate.status]}
                  </Badge>
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[
                    candidate.desiredJobTitle,
                    candidate.source,
                    `Postulé le ${formatDateOnly(candidate.appliedOn)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {candidate.phone && (
                    <a href={`tel:${candidate.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                      <Phone className="size-3.5 shrink-0" />
                      {candidate.phone}
                    </a>
                  )}
                  {candidate.email && (
                    <a href={`mailto:${candidate.email}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                      <Mail className="size-3.5 shrink-0" />
                      {candidate.email}
                    </a>
                  )}
                </div>

                {candidate.notes && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{candidate.notes}</p>
                )}

                <ResumeLink candidate={candidate} />

                {candidate.employeeId && (
                  <Link
                    href={`/ressources-humaines/employes/${candidate.employeeId}`}
                    className="mt-1 block text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Voir sa fiche d&apos;employé
                  </Link>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label="Actions sur ce candidat">
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {!candidate.employeeId && (
                    <DropdownMenuItem onClick={() => setHiring(candidate)}>
                      <UserPlus />
                      Embaucher
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(candidate);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(candidate)}>
                    <Trash2 />
                    Retirer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <CandidateFormSheet
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        candidate={editing}
        defaultJobPostingId={jobPosting?.id}
      />

      <HireDialog
        key={hiring?.id ?? "aucun"}
        candidate={hiring}
        onOpenChange={(open) => !open && setHiring(undefined)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer ce candidat ?"
        description={`${deleteTarget?.firstName ?? ""} ${deleteTarget?.lastName ?? ""} sera retiré de la liste. Son CV reste dans la bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
