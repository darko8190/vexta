"use client";

import { useState } from "react";
import { Bot, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useAiSettingsQuery,
  useForgetAiKey,
  useSaveAiSettings,
  useTestAssistant,
} from "@/hooks/use-assistant";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";

/**
 * The two providers a company can bring, with a sensible model each and a pointer to where the
 * key is made. The model is free text underneath: a company whose provider shipped something
 * new this morning should not have to wait for us to add a constant.
 */
const PROVIDERS = [
  {
    value: "Anthropic",
    label: "Claude",
    vendor: "Anthropic",
    defaultModel: "claude-opus-5-5",
    keysUrl: "https://console.anthropic.com/settings/keys",
    hint: "claude-opus-5-5 pour le meilleur raisonnement, claude-haiku-5-5 pour le moins cher.",
  },
  {
    value: "OpenAi",
    label: "ChatGPT",
    vendor: "OpenAI",
    defaultModel: "gpt-5",
    keysUrl: "https://platform.openai.com/api-keys",
    hint: "Le modèle doit savoir utiliser des outils ; les modèles « mini » y arrivent moins bien.",
  },
] as const;

function message(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function AiAssistantCard() {
  const { data, isLoading } = useAiSettingsQuery();
  const save = useSaveAiSettings();
  const forget = useForgetAiKey();
  const test = useTestAssistant();

  // Seeded once from the server and owned by the form afterwards. The key is never seeded:
  // it is not sent back, and an empty box means "keep the one on file".
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [canWrite, setCanWrite] = useState<boolean | null>(null);

  if (isLoading || !data) {
    return <Skeleton className="h-96 max-w-lg" />;
  }

  const currentProvider = provider ?? data.provider;
  const currentModel = model ?? data.model;
  const currentEnabled = enabled ?? data.isEnabled;
  const currentCanWrite = canWrite ?? data.canWrite;

  const chosen = PROVIDERS.find((p) => p.value === currentProvider) ?? PROVIDERS[0];
  const canEnable = data.hasApiKey || apiKey.trim().length > 0;

  async function onSave() {
    try {
      await save.mutateAsync({
        provider: currentProvider,
        model: currentModel.trim(),
        apiKey: apiKey.trim() || null,
        isEnabled: currentEnabled,
        canWrite: currentCanWrite,
      });
      setApiKey("");
      toast.success("Assistant enregistré.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer l'assistant.");
    }
  }

  async function onForget() {
    try {
      await forget.mutateAsync();
      setApiKey("");
      setEnabled(false);
      toast.success("Clé oubliée. L'assistant est éteint.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'oublier la clé.");
    }
  }

  async function onTest() {
    try {
      const result = await test.mutateAsync();
      if (result.modelReachable) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(message(error, "Le test n'a pas pu être lancé."));
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Assistant IA
          </CardTitle>
          <Badge variant={data.isEnabled ? "default" : "outline"}>
            {data.isEnabled ? "Actif" : "Éteint"}
          </Badge>
        </div>
        <CardDescription>
          Branchez votre compte Claude ou ChatGPT. Un bouton apparaît alors en haut de
          l&apos;écran et ouvre une conversation avec l&apos;assistant, qui travaille dans Vexta
          à votre place.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!data.featureIncluded && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            L&apos;assistant n&apos;est pas inclus dans votre forfait. Vous pouvez tout préparer
            ici ; le bouton n&apos;apparaîtra qu&apos;une fois la fonctionnalité ajoutée à votre
            forfait.
          </p>
        )}

        <Field>
          <FieldLabel>Fournisseur</FieldLabel>
          <div role="radiogroup" aria-label="Fournisseur" className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((item) => {
              const selected = item.value === currentProvider;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setProvider(item.value);
                    // The model that goes with the provider, unless this company has typed
                    // one: switching providers must not leave a Claude model name pointed at
                    // OpenAI, which fails with a message nobody can act on.
                    if (!PROVIDERS.some((p) => p.defaultModel === currentModel && p.value === item.value)) {
                      setModel(item.defaultModel);
                    }
                  }}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.vendor}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="ai-model">Modèle</FieldLabel>
          <Input
            id="ai-model"
            value={currentModel}
            onChange={(event) => setModel(event.target.value)}
            placeholder={ex(chosen.defaultModel)}
          />
          <FieldDescription>{chosen.hint}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="ai-key">Clé API {chosen.vendor}</FieldLabel>
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={data.hasApiKey ? "••••••••  (une clé est enregistrée)" : ex("sk-…")}
          />
          <FieldDescription>
            La clé est chiffrée et ne ressort jamais d&apos;ici — même pour vous. C&apos;est
            votre compte {chosen.vendor} qui est facturé pour ce que l&apos;assistant consomme.{" "}
            <a
              href={chosen.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
            >
              Créer une clé
              <ExternalLink className="size-3" />
            </a>
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="ai-enabled"
            checked={currentEnabled}
            disabled={!canEnable}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <FieldLabel htmlFor="ai-enabled">Activer l&apos;assistant</FieldLabel>
        </Field>
        {!canEnable && (
          <FieldDescription>
            Entrez d&apos;abord une clé : un bouton qui ne peut que échouer ne vaut pas la peine
            d&apos;être affiché.
          </FieldDescription>
        )}

        <Field orientation="horizontal">
          <Checkbox
            id="ai-write"
            checked={currentCanWrite}
            onCheckedChange={(checked) => setCanWrite(checked === true)}
          />
          <FieldLabel htmlFor="ai-write">
            L&apos;autoriser à créer et à modifier
          </FieldLabel>
        </Field>
        <FieldDescription>
          Décoché, l&apos;assistant lit et répond, et toute écriture est refusée par le serveur —
          pas seulement déconseillée dans ses instructions. Dans les deux cas il ne peut rien
          supprimer : ça, c&apos;est à vous, depuis l&apos;écran concerné. Il travaille toujours
          avec les droits de la personne qui lui parle : il ne voit rien qu&apos;elle ne verrait
          pas elle-même.
        </FieldDescription>
      </CardContent>

      <CardFooter className="gap-2">
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
        {data.hasApiKey && data.isEnabled && (
          <Button variant="outline" onClick={onTest} disabled={test.isPending}>
            {test.isPending && <Spinner />}
            Tester
          </Button>
        )}
        {data.hasApiKey && (
          <Button variant="ghost" onClick={onForget} disabled={forget.isPending}>
            {forget.isPending && <Spinner />}
            Oublier la clé
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/** Shown where the assistant is talked about but not configured, to avoid a bare empty panel. */
export function AiAssistantHint() {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Bot className="mt-0.5 size-4 shrink-0" />
      <span>L&apos;assistant travaille avec vos droits et avec la clé de votre entreprise.</span>
    </p>
  );
}
