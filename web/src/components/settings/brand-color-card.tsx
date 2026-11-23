"use client";

import { useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { BrandTheme } from "@/components/layout/brand-theme";
import { useSaveCompanyProfile } from "@/hooks/use-company";
import { ApiError } from "@/lib/api";
import { normalizeHex } from "@/lib/brand-color";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { CompanyProfile } from "@/lib/types";
import { ex } from "@/lib/placeholders";

/**
 * A starting point, not a restriction: the picker beside them takes any colour. They exist
 * because "choose your company's colour" in front of an empty hex field is a question most
 * people answer with whatever they can name, and these are already legible as a button.
 */
const PRESETS: { hex: string; label: string }[] = [
  { hex: "#0982CE", label: "Bleu" },
  { hex: "#1E40AF", label: "Marine" },
  { hex: "#0F766E", label: "Sarcelle" },
  { hex: "#15803D", label: "Vert" },
  { hex: "#B45309", label: "Ambre" },
  { hex: "#B91C1C", label: "Brique" },
  { hex: "#6D28D9", label: "Violet" },
  { hex: "#334155", label: "Graphite" },
];

/**
 * Where a company picks the colour the application and its invoices are painted in.
 *
 * The preview is the real thing: the chosen colour is applied to this card through the same
 * stylesheet the whole application uses, so what is shown here is what will be saved — not an
 * approximation drawn with inline styles.
 */
export function BrandColorCard({ profile }: { profile: CompanyProfile }) {
  const save = useSaveCompanyProfile();
  const { refresh } = useAuth();

  const [color, setColor] = useState<string>(profile.brandColor ?? "#0982CE");
  const [typed, setTyped] = useState<string | null>(null);

  const chosen = normalizeHex(color);
  const current = normalizeHex(profile.brandColor);
  const dirty = chosen !== current;

  async function persist(next: string | null) {
    try {
      // The whole profile goes up: this endpoint saves the company's card, and sending only the
      // colour would blank the name.
      await save.mutateAsync({
        name: profile.name,
        description: profile.description,
        contactEmail: profile.contactEmail,
        phone: profile.phone,
        brandColor: next,
      });

      // The colour travels in the session, so the application repaints only once the session
      // has been read again.
      await refresh();
      toast.success(next ? "Couleur enregistrée." : "Couleur par défaut rétablie.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la couleur.");
    }
  }

  return (
    <Card>
      {/* Scoped to this card only until it is saved: the preview below has to show the chosen
          colour while the rest of the page still shows the one in force. */}
      {dirty && chosen && <BrandTheme color={chosen} />}

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="size-4" />
          Couleur
        </CardTitle>
        <CardDescription>
          Vos boutons, vos liens et le bandeau de vos factures PDF prennent cette couleur.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const active = chosen === preset.hex;
            return (
              <button
                key={preset.hex}
                type="button"
                aria-label={preset.label}
                aria-pressed={active}
                title={preset.label}
                onClick={() => {
                  setColor(preset.hex);
                  setTyped(null);
                }}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border-2 transition-transform",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  "motion-safe:hover:scale-105 motion-reduce:transition-none",
                  active ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: preset.hex }}
              >
                {active && <Check className="size-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="brand-color-picker">Choisir</FieldLabel>
            <input
              id="brand-color-picker"
              type="color"
              value={chosen ?? "#0982CE"}
              onChange={(event) => {
                setColor(event.target.value.toUpperCase());
                setTyped(null);
              }}
              className="h-10 w-20 cursor-pointer rounded-md border border-input bg-transparent p-1"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="brand-color-hex">Code</FieldLabel>
            <Input
              id="brand-color-hex"
              value={typed ?? chosen ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setTyped(value);
                const normalized = normalizeHex(value);
                if (normalized) setColor(normalized);
              }}
              onBlur={() => setTyped(null)}
              placeholder={ex("#0982CE")}
              className="font-mono"
              aria-invalid={typed !== null && normalizeHex(typed) === null}
            />
            <FieldDescription>
              {typed !== null && normalizeHex(typed) === null
                ? "Format attendu : #RRGGBB."
                : "Six caractères, comme sur votre charte graphique."}
            </FieldDescription>
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Aperçu</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">Enregistrer</Button>
            <Button type="button" variant="outline">
              Annuler
            </Button>
            <a href="#" onClick={(event) => event.preventDefault()} className="text-sm text-primary underline-offset-4 hover:underline">
              Un lien
            </a>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button type="button" disabled={!dirty || !chosen || save.isPending} onClick={() => persist(chosen)}>
          {save.isPending && <Spinner />}
          Enregistrer la couleur
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              setColor("#0982CE");
              setTyped(null);
              persist(null);
            }}
          >
            <RotateCcw />
            Couleur Vexta
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
