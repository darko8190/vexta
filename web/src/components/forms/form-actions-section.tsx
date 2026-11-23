"use client";

import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/layout/empty-state";
import { useSaveFormActions } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import { clientStatusLabels, formActionKindLabels } from "@/lib/labels";
import { ex } from "@/lib/placeholders";
import type {
  ClientStatus,
  FormAction,
  FormActionKind,
  SaveFormActionValues,
} from "@/lib/types";

const kinds = Object.keys(formActionKindLabels) as FormActionKind[];
const statuses = Object.keys(clientStatusLabels) as ClientStatus[];

interface Row extends SaveFormActionValues {
  key: string;
}

function toRows(actions: FormAction[]): Row[] {
  return actions.map((action) => ({
    key: action.id,
    id: action.id,
    kind: action.kind,
    recipients: action.recipients,
    subject: action.subject,
    newClientStatus: action.newClientStatus,
    isActive: action.isActive,
  }));
}

function blankRow(): Row {
  return {
    key: `nouvelle-${Math.random().toString(36).slice(2)}`,
    id: null,
    kind: "EnvoyerCourriel",
    recipients: null,
    subject: null,
    newClientStatus: "Prospect",
    isActive: true,
  };
}

/**
 * What a filled form sets off.
 *
 * This is the half that makes a form worth building. Most tools stop at collecting answers, and
 * then the answers sit in a list nobody opens — the value is in what happens next.
 *
 * Saved as a list, like the questions, and for the same reason.
 */
export function FormActionsSection({
  formId,
  actions,
  canManage,
}: {
  formId: string;
  actions: FormAction[];
  canManage: boolean;
}) {
  const save = useSaveFormActions(formId);

  // Seeded once, at mount — see FormQuestionsSection: the page re-keys this component when the
  // form is saved, so there is nothing to mirror from the props afterwards.
  const [rows, setRows] = useState<Row[]>(() => toRows(actions));
  const [dirty, setDirty] = useState(false);

  function edit(key: string, change: Partial<Row>) {
    setDirty(true);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  async function persist() {
    try {
      await save.mutateAsync(
        rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          recipients: row.recipients?.trim() || null,
          subject: row.subject?.trim() || null,
          newClientStatus: row.newClientStatus,
          isActive: row.isActive,
        })),
      );
      setDirty(false);
      toast.success("Actions enregistrées.");
    } catch (error) {
      // The API refuses an address that is not one, and a "créer un client" with no question
      // that could be its name — both say which, so the message is worth showing as it is.
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer les actions.",
      );
    }
  }

  const addButton = canManage ? (
    <Button
      variant="outline"
      onClick={() => {
        setDirty(true);
        setRows((current) => [...current, blankRow()]);
      }}
    >
      <Plus />
      Ajouter une action
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Actions</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui se passe dès qu&apos;un formulaire est rempli.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {addButton}
          {canManage && (
            <Button onClick={persist} disabled={save.isPending || !dirty}>
              {save.isPending && <Spinner />}
              Enregistrer les actions
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Aucune action"
          description="Sans action, les réponses sont simplement conservées ici. Ajoutez-en une pour qu'elles partent au bureau par courriel, ou qu'elles créent un client."
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-3">
                  <Field>
                    <FieldLabel htmlFor={`kind-${row.key}`}>Action</FieldLabel>
                    <Select
                      value={row.kind}
                      disabled={!canManage}
                      onValueChange={(value) =>
                        edit(row.key, { kind: (value ?? "EnvoyerCourriel") as FormActionKind })
                      }
                    >
                      <SelectTrigger id={`kind-${row.key}`} className="w-full">
                        <SelectValue>
                          {(value: FormActionKind) => formActionKindLabels[value]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {kinds.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {formActionKindLabels[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {row.kind === "EnvoyerCourriel" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor={`recipients-${row.key}`}>Destinataires</FieldLabel>
                        <Input
                          id={`recipients-${row.key}`}
                          value={row.recipients ?? ""}
                          disabled={!canManage}
                          onChange={(event) => edit(row.key, { recipients: event.target.value })}
                          placeholder={ex("bureau@entreprise.ca, patron@entreprise.ca")}
                        />
                        <FieldDescription>
                          Séparés par des virgules. Le premier reçoit le message, les autres sont
                          en copie. Dix au maximum.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`subject-${row.key}`}>Objet</FieldLabel>
                        <Input
                          id={`subject-${row.key}`}
                          value={row.subject ?? ""}
                          disabled={!canManage}
                          onChange={(event) => edit(row.key, { subject: event.target.value })}
                          placeholder={ex("Inspection — chantier Dubé")}
                        />
                        <FieldDescription>
                          Vide, c&apos;est le titre du formulaire qui sert d&apos;objet.
                        </FieldDescription>
                      </Field>
                    </>
                  )}

                  {row.kind === "CreerClient" && (
                    <Field>
                      <FieldLabel htmlFor={`status-${row.key}`}>État du client créé</FieldLabel>
                      <Select
                        value={row.newClientStatus}
                        disabled={!canManage}
                        onValueChange={(value) =>
                          edit(row.key, { newClientStatus: (value ?? "Prospect") as ClientStatus })
                        }
                      >
                        <SelectTrigger id={`status-${row.key}`} className="w-full">
                          <SelectValue>
                            {(value: ClientStatus) => clientStatusLabels[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {clientStatusLabels[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Le client se construit avec les questions dont la colonne « Remplit »
                        pointe vers un de ses champs. Il faut au moins un nom.
                      </FieldDescription>
                    </Field>
                  )}

                  <Field orientation="horizontal">
                    <Checkbox
                      id={`active-${row.key}`}
                      checked={row.isActive}
                      disabled={!canManage}
                      onCheckedChange={(checked) => edit(row.key, { isActive: checked === true })}
                    />
                    <FieldLabel htmlFor={`active-${row.key}`} className="font-normal">
                      Active
                    </FieldLabel>
                  </Field>
                </div>

                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Retirer cette action"
                    onClick={() => {
                      setDirty(true);
                      setRows((current) =>
                        current.filter((candidate) => candidate.key !== row.key),
                      );
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
