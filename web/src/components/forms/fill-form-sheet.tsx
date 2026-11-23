"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
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
import { useFormQuery, useSubmitForm } from "@/hooks/use-forms";
import { ApiError } from "@/lib/api";
import type { FormField } from "@/lib/types";

/** The answers as the server stores them: one string per question, whatever its type. */
type Answers = Record<string, string>;

/** A MultiChoix keeps its chosen labels joined by a comma, which is how it is stored and sent. */
function chosen(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/**
 * One copy of a form, filled.
 *
 * Validation is the server's: it holds the questions and their types, and a browser that
 * decided for itself what counts as an answer would be a second rulebook to keep in step. What
 * is done here is marking the required ones, so nobody gets a refusal for something that could
 * have been said before they tapped send.
 *
 * What the actions did is shown on the way out and not swallowed. A form whose e-mail did not
 * leave has to say so on the spot, or the person walks away believing the office has been told.
 */
export function FillFormSheet({
  open,
  onOpenChange,
  formId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
}) {
  const { data, isLoading } = useFormQuery(open ? formId : undefined);
  const submit = useSubmitForm(formId);

  const [answers, setAnswers] = useState<Answers>({});
  const [missing, setMissing] = useState<string[]>([]);

  function set(fieldId: string, value: string) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setMissing((current) => current.filter((id) => id !== fieldId));
  }

  async function send() {
    const fields = data?.fields ?? [];

    const blank = fields
      .filter((field) => field.isRequired && !(answers[field.id] ?? "").trim())
      .map((field) => field.id);

    if (blank.length > 0) {
      setMissing(blank);
      toast.error(
        blank.length === 1
          ? "Une question obligatoire est restée vide."
          : `${blank.length} questions obligatoires sont restées vides.`,
      );
      return;
    }

    try {
      const result = await submit.mutateAsync(
        fields.map((field) => ({ fieldId: field.id, value: answers[field.id] ?? null })),
      );

      toast.success(result.successMessage, {
        description: result.actionLog ?? undefined,
        // Longer than the default: the action log is the one chance to say that an e-mail did
        // not leave, and four seconds is not enough to read a sentence somebody did not expect.
        duration: result.actionLog ? 10_000 : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'envoyer ce formulaire.");
    }
  }

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where the React Compiler lint can see it is not a render-time cascade.
      onOpenChange={(next) => {
        if (!next) {
          setAnswers({});
          setMissing([]);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{data?.form.title ?? "Formulaire"}</SheetTitle>
          <SheetDescription>
            {data?.form.description ?? "Répondez aux questions, puis envoyez."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : !data ? (
            <Alert>
              <AlertTitle>Formulaire introuvable</AlertTitle>
              <AlertDescription>Il a peut-être été supprimé entre-temps.</AlertDescription>
            </Alert>
          ) : data.fields.length === 0 ? (
            <Alert>
              <AlertTitle>Aucune question</AlertTitle>
              <AlertDescription>Ce formulaire n&apos;a rien à demander.</AlertDescription>
            </Alert>
          ) : (
            <FieldGroup>
              {data.fields.map((field) => (
                <AnswerField
                  key={field.id}
                  field={field}
                  value={answers[field.id] ?? ""}
                  onChange={(value) => set(field.id, value)}
                  invalid={missing.includes(field.id)}
                />
              ))}
            </FieldGroup>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            onClick={send}
            disabled={submit.isPending || isLoading || !data || data.fields.length === 0}
          >
            {submit.isPending && <Spinner />}
            Envoyer
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** One question, drawn as whatever its type asks for. */
function AnswerField({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const id = `answer-${field.id}`;

  const label = (
    <FieldLabel htmlFor={id}>
      {field.label}
      {field.isRequired && <RequiredMark />}
    </FieldLabel>
  );

  const help = field.helpText ? <FieldDescription>{field.helpText}</FieldDescription> : null;

  if (field.type === "OuiNon") {
    return (
      <Field orientation="horizontal" data-invalid={invalid}>
        <Checkbox
          id={id}
          checked={value === "Oui"}
          onCheckedChange={(checked) => onChange(checked === true ? "Oui" : "Non")}
        />
        <div className="min-w-0">
          <FieldLabel htmlFor={id} className="font-normal">
            {field.label}
            {field.isRequired && <RequiredMark />}
          </FieldLabel>
          {help}
        </div>
      </Field>
    );
  }

  if (field.type === "Choix") {
    return (
      <Field data-invalid={invalid}>
        {label}
        <Select value={value || null} onValueChange={(next) => onChange(next ?? "")}>
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue>
              {(current: string) => current || "Choisir une réponse"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </Field>
    );
  }

  if (field.type === "MultiChoix") {
    const picked = chosen(value);

    return (
      <Field data-invalid={invalid}>
        {label}
        <div className="space-y-2">
          {field.options.map((option) => (
            <div key={option} className="flex items-center gap-3">
              <Checkbox
                id={`${id}-${option}`}
                checked={picked.includes(option)}
                onCheckedChange={(checked) => {
                  // Rebuilt from the offered options rather than by appending, so the stored
                  // order is always the order the questions offers them in.
                  const next = field.options.filter((candidate) =>
                    candidate === option ? checked === true : picked.includes(candidate),
                  );
                  onChange(next.join(", "));
                }}
              />
              <FieldLabel htmlFor={`${id}-${option}`} className="font-normal">
                {option}
              </FieldLabel>
            </div>
          ))}
        </div>
        {help}
      </Field>
    );
  }

  if (field.type === "TexteLong") {
    return (
      <Field data-invalid={invalid}>
        {label}
        <Textarea
          id={id}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
        />
        {help}
      </Field>
    );
  }

  const inputType =
    field.type === "Nombre"
      ? "number"
      : field.type === "Date"
        ? "date"
        : field.type === "Courriel"
          ? "email"
          : field.type === "Telephone"
            ? "tel"
            : "text";

  return (
    <Field data-invalid={invalid}>
      {label}
      <Input
        id={id}
        type={inputType}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
      />
      {help}
    </Field>
  );
}
