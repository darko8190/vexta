"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import { useSaveFormFields } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import {
  formFieldTargetLabels,
  formFieldTypeHints,
  formFieldTypeLabels,
} from "@/lib/labels";
import { ex } from "@/lib/placeholders";
import type { FormField, FormFieldTarget, FormFieldType, SaveFormFieldValues } from "@/lib/types";

const types = Object.keys(formFieldTypeLabels) as FormFieldType[];
const targets = Object.keys(formFieldTargetLabels) as FormFieldTarget[];

/** A row being edited. The key is local and never sent: a new question has no id yet. */
interface Row extends SaveFormFieldValues {
  key: string;
}

function toRows(fields: FormField[]): Row[] {
  return fields.map((field) => ({
    key: field.id,
    id: field.id,
    label: field.label,
    type: field.type,
    isRequired: field.isRequired,
    helpText: field.helpText,
    options: field.options,
    target: field.target,
  }));
}

function blankRow(): Row {
  return {
    key: `nouvelle-${Math.random().toString(36).slice(2)}`,
    id: null,
    label: "",
    type: "Texte",
    isRequired: false,
    helpText: null,
    options: [],
    target: "Aucun",
  };
}

/**
 * The questions, built as a list and saved as a list.
 *
 * One save for the whole set rather than a request per row. Building a form is reordering,
 * renaming and deleting in the same sitting, and a screen that saved each keystroke would be a
 * screen where half a rename is a question nobody asked.
 *
 * The unsaved state is visible — the button says so and stays enabled — because the alternative
 * is somebody closing the page believing twelve questions were kept.
 */
export function FormQuestionsSection({
  formId,
  fields,
  canManage,
}: {
  formId: string;
  fields: FormField[];
  canManage: boolean;
}) {
  const save = useSaveFormFields(formId);

  // Seeded once, at mount. Nothing re-reads the props afterwards: the page gives this component
  // a key that changes when the form is saved, so React remounts it with the saved list — and a
  // background refetch that returns the same thing leaves the typing alone, which an effect
  // mirroring props into state could not promise.
  const [rows, setRows] = useState<Row[]>(() => toRows(fields));
  const [dirty, setDirty] = useState(false);

  function edit(key: string, change: Partial<Row>) {
    setDirty(true);
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;

    setDirty(true);
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function persist() {
    const blank = rows.find((row) => !row.label.trim());
    if (blank) {
      toast.error("Chaque question a besoin d'un libellé.");
      return;
    }

    try {
      await save.mutateAsync(
        rows.map((row) => ({
          id: row.id,
          label: row.label.trim(),
          type: row.type,
          isRequired: row.isRequired,
          helpText: row.helpText?.trim() || null,
          options: row.options,
          target: row.target,
        })),
      );
      setDirty(false);
      toast.success("Questions enregistrées.");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer les questions.",
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
      Ajouter une question
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Questions</h2>
          <p className="text-sm text-muted-foreground">
            Ce que le formulaire demande, dans l&apos;ordre où il le demande.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {addButton}
          {/* The label never changes. A button that reads "Enregistré" is a state wearing a
              button's clothes, and the eye stops trusting what the others say. Disabled is what
              says there is nothing to save. */}
          {canManage && (
            <Button onClick={persist} disabled={save.isPending || !dirty}>
              {save.isPending && <Spinner />}
              Enregistrer les questions
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="Aucune question"
          description="Ajoutez votre première question : son libellé, et le type de réponse attendu."
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-center text-sm text-muted-foreground tabular-nums">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-3">
                  <Field>
                    <FieldLabel htmlFor={`question-${row.key}`}>Libellé</FieldLabel>
                    <Input
                      id={`question-${row.key}`}
                      value={row.label}
                      disabled={!canManage}
                      onChange={(event) => edit(row.key, { label: event.target.value })}
                      placeholder={ex("Le chantier était-il propre au départ ?")}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`type-${row.key}`}>Type de réponse</FieldLabel>
                      <Select
                        value={row.type}
                        disabled={!canManage}
                        onValueChange={(value) =>
                          edit(row.key, { type: (value ?? "Texte") as FormFieldType })
                        }
                      >
                        <SelectTrigger id={`type-${row.key}`} className="w-full">
                          <SelectValue>
                            {(value: FormFieldType) => formFieldTypeLabels[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {types.map((type) => (
                            <SelectItem key={type} value={type}>
                              {formFieldTypeLabels[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>{formFieldTypeHints[row.type]}</FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`target-${row.key}`}>Remplit</FieldLabel>
                      <Select
                        value={row.target}
                        disabled={!canManage}
                        onValueChange={(value) =>
                          edit(row.key, { target: (value ?? "Aucun") as FormFieldTarget })
                        }
                      >
                        <SelectTrigger id={`target-${row.key}`} className="w-full">
                          <SelectValue>
                            {(value: FormFieldTarget) => formFieldTargetLabels[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {targets.map((target) => (
                            <SelectItem key={target} value={target}>
                              {formFieldTargetLabels[target]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Seulement si le formulaire crée un client. Sinon, laissez « Aucun ».
                      </FieldDescription>
                    </Field>
                  </div>

                  {/* Only the two types that offer choices ask for them. */}
                  {(row.type === "Choix" || row.type === "MultiChoix") && (
                    <Field>
                      <FieldLabel htmlFor={`options-${row.key}`}>Choix offerts</FieldLabel>
                      <Textarea
                        id={`options-${row.key}`}
                        rows={3}
                        disabled={!canManage}
                        value={row.options.join("\n")}
                        onChange={(event) =>
                          edit(row.key, { options: event.target.value.split("\n") })
                        }
                        placeholder={"Oui\nNon\nSans objet"}
                      />
                      <FieldDescription>Un choix par ligne. Au moins deux.</FieldDescription>
                    </Field>
                  )}

                  <Field>
                    <FieldLabel htmlFor={`help-${row.key}`}>Texte d&apos;aide</FieldLabel>
                    <Input
                      id={`help-${row.key}`}
                      value={row.helpText ?? ""}
                      disabled={!canManage}
                      onChange={(event) => edit(row.key, { helpText: event.target.value })}
                      placeholder={ex("Le NIV se trouve au bas du pare-brise.")}
                    />
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id={`required-${row.key}`}
                      checked={row.isRequired}
                      disabled={!canManage}
                      onCheckedChange={(checked) =>
                        edit(row.key, { isRequired: checked === true })
                      }
                    />
                    <FieldLabel htmlFor={`required-${row.key}`} className="font-normal">
                      Obligatoire
                    </FieldLabel>
                  </Field>
                </div>

                {canManage && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Monter cette question"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Descendre cette question"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Retirer cette question"
                      onClick={() => {
                        setDirty(true);
                        setRows((current) => current.filter((candidate) => candidate.key !== row.key));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && canManage && (
        <p className="mt-3 text-sm text-muted-foreground">
          Les modifications ne sont pas encore enregistrées. Les réponses déjà reçues gardent les
          questions telles qu&apos;elles étaient le jour où elles ont été remplies.
        </p>
      )}
    </div>
  );
}
