"use client";

import { useState } from "react";
import type { FormField, PublicForm } from "@/lib/types";

/**
 * Loading a public form, holding the answers, and sending them back — the part shared by the
 * dialog on a company's page and the form's own page (/f/{id}). Only the way in differs: the
 * endpoint, and where the form sits in what it answers.
 */
export function usePublicFormFill<T>(
  endpoint: string,
  toForm: (payload: T) => PublicForm,
  /** Sent along with the answers: the e-mailed link's token, on the form's own page. */
  invitation: string | null = null,
) {
  const [payload, setPayload] = useState<T | null>(null);
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const requiresIdentification = payload ? Boolean(toForm(payload).requiresIdentification) : false;

  /** Starts over with empty answers; the questions are fetched only the first time. */
  async function load() {
    setError(null);
    setDone(null);
    setAnswers({});

    // Already in hand from a previous opening: somebody who closed the dialog to check their
    // kilometre reading should not wait for the questions a second time.
    if (fields) return;

    setLoading(true);

    try {
      const response = await fetch(endpoint, { cache: "no-store" });

      if (!response.ok) {
        setGone(true);
        setError("Ce formulaire n'est plus disponible.");
        return;
      }

      const loaded = (await response.json()) as T;
      setPayload(loaded);

      // The public shape carries the options as one string per line, which is how they are
      // stored; AnswerField wants them split, like the staff shape it was written for.
      setFields(
        toForm(loaded).fields.map((field) => ({
          id: field.id,
          label: field.label,
          helpText: field.helpText,
          type: field.type,
          isRequired: field.isRequired,
          options: (field.options ?? "")
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean),
          target: "Aucun",
          sortOrder: 0,
        })),
      );
    } catch {
      setError("Le formulaire n'a pas pu être chargé. Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    setError(null);
    setSending(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitation,
          answers: (fields ?? []).map((field) => ({
            fieldId: field.id,
            value: answers[field.id]?.trim() || null,
          })),
        }),
      });

      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        // The API says which question is missing, and which ceiling was reached. Worth showing
        // as it is: "une erreur est survenue" sends somebody away, "le téléphone est
        // obligatoire" gets the form filled.
        setError(result?.message ?? "Votre demande n'a pas pu être envoyée.");
        return;
      }

      setDone(result?.message ?? "Merci, votre demande est envoyée.");
    } catch {
      setError("Votre demande n'a pas pu être envoyée. Réessayez dans un instant.");
    } finally {
      setSending(false);
    }
  }

  function setAnswer(fieldId: string, value: string) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  return {
    payload,
    fields,
    answers,
    setAnswer,
    loading,
    sending,
    error,
    gone,
    done,
    requiresIdentification,
    load,
    send,
  };
}
