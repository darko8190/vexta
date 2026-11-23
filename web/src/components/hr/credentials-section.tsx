"use client";

import { useRef, useState } from "react";
import { GraduationCap, MoreHorizontal, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EmployeePicker } from "@/components/team/employee-picker";
import {
  useCredentialsQuery,
  useDeleteCredential,
  useSaveCredential,
} from "@/hooks/use-employee-file";
import { useMediaLink, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api";
import { credentialExpiryLabel, credentialKindLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";
import { ex } from "@/lib/placeholders";
import type { CredentialKind, EmployeeCredential } from "@/lib/types";

const kinds = Object.keys(credentialKindLabels) as CredentialKind[];

function CredentialFormSheet({
  open,
  onOpenChange,
  credential,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential?: EmployeeCredential;
  employeeId?: string;
}) {
  const isEditing = Boolean(credential);
  const save = useSaveCredential();
  const upload = useUploadMedia();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const [owner, setOwner] = useState(credential?.employeeId ?? employeeId ?? "");
  const [kind, setKind] = useState<CredentialKind>(credential?.kind ?? "Formation");
  const [name, setName] = useState(credential?.name ?? "");
  const [issuer, setIssuer] = useState(credential?.issuer ?? "");
  const [reference, setReference] = useState(credential?.reference ?? "");
  const [issuedOn, setIssuedOn] = useState(credential?.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(credential?.expiresOn ?? "");
  const [note, setNote] = useState(credential?.note ?? "");

  async function onSubmit() {
    if (!owner) {
      toast.error("Choisissez de qui il s'agit.");
      return;
    }
    if (!name.trim()) {
      toast.error("Donnez un nom à cette formation ou à ce permis.");
      return;
    }

    try {
      // The card is uploaded first and only a stored file gets written onto the row: the other
      // order leaves a credential pointing at nothing.
      const assetId = file ? (await upload.mutateAsync(file)).id : credential?.mediaAssetId ?? null;

      await save.mutateAsync({
        id: credential?.id ?? null,
        values: {
          employeeId: owner,
          kind,
          name: name.trim(),
          issuer: issuer.trim() || null,
          reference: reference.trim() || null,
          issuedOn: issuedOn || null,
          expiresOn: expiresOn || null,
          mediaAssetId: assetId,
          note: note.trim() || null,
        },
      });

      toast.success(isEditing ? "Mise à jour." : "Ajoutée au dossier.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Impossible d'enregistrer.",
      );
    }
  }

  const busy = save.isPending || upload.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier" : "Nouvelle formation ou permis"}</SheetTitle>
          <SheetDescription>
            La date d&apos;expiration est ce qui compte : c&apos;est elle qui fait refuser
            quelqu&apos;un à la barrière.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {!employeeId && (
              <Field>
                <FieldLabel htmlFor="credential-employee">Employé</FieldLabel>
                <EmployeePicker id="credential-employee" value={owner} onChange={setOwner} />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field>
                <FieldLabel htmlFor="credential-kind">Type</FieldLabel>
                <Select value={kind} onValueChange={(value) => setKind((value ?? "Formation") as CredentialKind)}>
                  <SelectTrigger id="credential-kind" className="w-full">
                    <SelectValue>{(value: CredentialKind) => credentialKindLabels[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((value) => (
                      <SelectItem key={value} value={value}>
                        {credentialKindLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="credential-name">Nom</FieldLabel>
                <Input
                  id="credential-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={ex("ASP Construction — Santé et sécurité")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="credential-issuer">Émis par</FieldLabel>
                <Input
                  id="credential-issuer"
                  value={issuer}
                  onChange={(event) => setIssuer(event.target.value)}
                  placeholder={ex("ASP Construction")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="credential-reference">Numéro</FieldLabel>
                <Input
                  id="credential-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={ex("A-123456")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="credential-issued">Émise le</FieldLabel>
                <Input
                  id="credential-issued"
                  type="date"
                  value={issuedOn}
                  onChange={(event) => setIssuedOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="credential-expires">Expire le</FieldLabel>
                <Input
                  id="credential-expires"
                  type="date"
                  value={expiresOn}
                  onChange={(event) => setExpiresOn(event.target.value)}
                />
                <FieldDescription>Laissez vide si elle n&apos;expire pas.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="credential-file">Carte</FieldLabel>
              <input
                ref={fileInput}
                id="credential-file"
                type="file"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload />
                {file || credential?.fileName ? "Changer le fichier" : "Joindre une photo"}
              </Button>
              <FieldDescription>
                {file
                  ? file.name
                  : credential?.fileName
                    ? `${credential.fileName} est au dossier.`
                    : "Facultatif. Les dates ci-dessus sont ce qui compte, pas l'image."}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="credential-note">Note</FieldLabel>
              <Textarea
                id="credential-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={ex("À renouveler avant le début du chantier de l'été.")}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter au dossier"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AttachedFile({ credential }: { credential: EmployeeCredential }) {
  const link = useMediaLink();

  if (!credential.mediaAssetId || !credential.fileName) return null;

  // The link is signed on demand and expires, like every other file here: a URL kept on the row
  // would have stopped working by the time anybody clicked it.
  async function open() {
    try {
      const { url } = await link.mutateAsync(credential.mediaAssetId!);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Impossible d'ouvrir ce fichier.");
    }
  }

  return (
    <Button
      variant="link"
      size="sm"
      className="mt-1 h-auto p-0 text-sm"
      onClick={open}
      disabled={link.isPending}
    >
      <Paperclip className="size-3.5" />
      {credential.fileName}
    </Button>
  );
}

/**
 * Cards, courses and licences, soonest to expire first.
 *
 * The ordering is the feature. A list sorted by name tells you what somebody holds; this one
 * tells you who is about to be turned around at a gate, which is the only question anybody
 * opens it to answer.
 */
export function CredentialsSection({ employeeId }: { employeeId?: string }) {
  const { data, isLoading, isError, error, refetch } = useCredentialsQuery(employeeId);
  const remove = useDeleteCredential();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeCredential | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeCredential | undefined>(undefined);

  const formKey = `${editing?.id ?? "nouvelle"}-${formOpen}`;

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Retirée du dossier.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cette entrée.");
    }
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Formations et permis</h2>
          <p className="text-sm text-muted-foreground">
            Les cartes de compétence et les formations, celles qui expirent le plus tôt en premier.
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Formations indisponibles"
          fallback="Les formations et permis n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Aucune formation au dossier"
          description="Ajoutez une carte de compétence ou une formation, avec la date où elle cesse de compter."
          action={addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((credential) => {
            const expiry = credentialExpiryLabel(credential.daysUntilExpiry);

            return (
              <li
                key={credential.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{credential.name}</span>
                    <Badge variant="secondary">{credentialKindLabels[credential.kind]}</Badge>
                    <Badge variant={expiry.variant}>{expiry.text}</Badge>
                  </div>

                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[
                      employeeId ? null : credential.employeeName,
                      credential.issuer,
                      credential.reference,
                      credential.expiresOn ? `jusqu'au ${formatDateOnly(credential.expiresOn)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {credential.note && (
                    <p className="mt-1 text-sm text-muted-foreground">{credential.note}</p>
                  )}

                  <AttachedFile credential={credential} />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Actions sur cette entrée">
                        <MoreHorizontal />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(credential);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(credential)}>
                      <Trash2 />
                      Retirer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <CredentialFormSheet
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        credential={editing}
        employeeId={employeeId}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cette entrée ?"
        description={`${deleteTarget?.name ?? ""} sera retirée du dossier. Le fichier joint reste dans la bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
