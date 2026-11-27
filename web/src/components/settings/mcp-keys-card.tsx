"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { useCreateMcpKey, useMcpAvailabilityQuery,
  useMcpEndpointQuery, useMcpKeysQuery, useRevokeMcpKey, type McpKey } from "@/hooks/use-mcp-keys";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copier ${label.toLowerCase()}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </Field>
  );
}

/**
 * The keys an outside system uses to work in Vexta through MCP — an AI agent, an automation.
 * A key acts as the person who made it, with their role, and only reads unless told otherwise.
 */
export function McpKeysCard() {
  const { data: keys, isLoading } = useMcpKeysQuery();
  const { data: endpoint } = useMcpEndpointQuery();
  const { data: availability } = useMcpAvailabilityQuery();
  const create = useCreateMcpKey();
  const revoke = useRevokeMcpKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [target, setTarget] = useState<McpKey | undefined>(undefined);

  async function onCreate() {
    try {
      const created = await create.mutateAsync({ name: name.trim(), canWrite });
      setSecret(created.secret);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer la clé.");
    }
  }

  function closeCreate(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setName("");
      setCanWrite(false);
      setSecret(null);
    }
  }

  async function onRevoke() {
    if (!target) return;
    try {
      await revoke.mutateAsync(target.id);
      toast.success("Clé révoquée.");
      setTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de révoquer la clé.");
    }
  }


  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          Clés MCP
        </CardTitle>
        <CardDescription>
          Pour qu&apos;un système externe (un agent IA, une automatisation) travaille dans Vexta. Une clé agit au
          nom de la personne qui l&apos;a créée, avec ses droits, et ne fait que lire sauf si vous permettez
          l&apos;écriture. La suppression n&apos;est jamais permise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {availability && !availability.included && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            Les clés MCP ne font pas partie de votre forfait. Les clés existantes ne fonctionnent pas tant que la
            fonctionnalité n&apos;est pas ajoutée.
          </p>
        )}
        {endpoint && <CopyField id="mcp-endpoint" label="Adresse du serveur MCP" value={endpoint} />}

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !keys || keys.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Aucune clé pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {key.name}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{key.prefix}…</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {key.canWrite ? "Lecture et écriture" : "Lecture seule"} · par {key.createdBy} ·{" "}
                    {key.lastUsedAt
                      ? `utilisée le ${new Date(key.lastUsedAt).toLocaleDateString("fr-CA")}`
                      : "jamais utilisée"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Révoquer la clé ${key.name}`} onClick={() => setTarget(key)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={availability ? !availability.included : false}>
          <Plus />
          Créer une clé
        </Button>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={closeCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{secret ? "Votre clé MCP" : "Nouvelle clé MCP"}</DialogTitle>
            <DialogDescription>
              {secret
                ? "Copiez-la maintenant : elle ne sera plus jamais affichée. Si vous la perdez, révoquez-la et créez-en une autre."
                : "Elle agira en votre nom, avec vos droits dans cette entreprise."}
            </DialogDescription>
          </DialogHeader>

          {secret ? (
            <div className="space-y-4">
              <CopyField id="mcp-secret" label="Clé" value={secret} />
              {endpoint && <McpSetupGuide endpoint={endpoint} secret={secret} />}
            </div>
          ) : (
            <div className="space-y-4">
              <Field>
                <FieldLabel htmlFor="mcp-key-name">Nom</FieldLabel>
                <Input
                  id="mcp-key-name"
                  value={name}
                  maxLength={100}
                  placeholder={ex("Agent de comptabilité")}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="mcp-key-write" checked={canWrite} onCheckedChange={(checked) => setCanWrite(checked === true)} />
                <FieldLabel htmlFor="mcp-key-write" className="font-normal">
                  Permettre l&apos;écriture (créer et modifier)
                </FieldLabel>
              </Field>
            </div>
          )}

          <DialogFooter>
            {secret ? (
              <DialogClose render={<Button type="button" />}>J&apos;ai copié la clé</DialogClose>
            ) : (
              <>
                <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
                <Button type="button" onClick={onCreate} disabled={!name.trim() || create.isPending}>
                  {create.isPending && <Spinner />}
                  Créer la clé
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(undefined)}
        title="Révoquer cette clé ?"
        description={`Le système qui utilise « ${target?.name ?? ""} » perdra l'accès immédiatement.`}
        onConfirm={onRevoke}
        pending={revoke.isPending}
      />
    </Card>
  );
}

/**
 * How to plug the key into each assistant. Most take the address and the key in a header;
 * ChatGPT and the others that cannot send a header take the address with the key in it, set
 * to no authentication — that address is then the secret.
 */
function McpSetupGuide({ endpoint, secret }: { endpoint: string; secret: string }) {
  const header = `Bearer ${secret}`;
  const keyedUrl = `${endpoint.replace(/\/$/, "")}/${secret}`;
  const guides: { value: string; label: string; steps: string; code?: string; copy?: string }[] = [
    {
      value: "chatgpt",
      label: "ChatGPT",
      steps:
        "Dans ChatGPT, ouvrez les réglages des connecteurs (mode développeur), créez un connecteur MCP, collez l'adresse ci-dessous et choisissez « Aucune authentification ». L'adresse contient la clé : gardez-la secrète.",
      copy: keyedUrl,
    },
    {
      value: "claude-code",
      label: "Claude Code",
      steps: "Dans un terminal :",
      code: `claude mcp add --transport http vexta ${endpoint} --header "Authorization: ${header}"`,
    },
    {
      value: "claude-desktop",
      label: "Claude Desktop",
      steps: "Dans le fichier de configuration de Claude Desktop (claude_desktop_config.json) :",
      code: JSON.stringify(
        { mcpServers: { vexta: { command: "npx", args: ["mcp-remote", endpoint, "--header", `Authorization:${header}`] } } },
        null,
        2,
      ),
    },
    {
      value: "cursor",
      label: "Cursor / Windsurf",
      steps: "Dans mcp.json :",
      code: JSON.stringify({ mcpServers: { vexta: { url: endpoint, headers: { Authorization: header } } } }, null, 2),
    },
    {
      value: "vscode",
      label: "VS Code",
      steps: "Dans .vscode/mcp.json :",
      code: JSON.stringify({ servers: { vexta: { type: "http", url: endpoint, headers: { Authorization: header } } } }, null, 2),
    },
    {
      value: "gemini",
      label: "Gemini CLI",
      steps: "Dans ~/.gemini/settings.json :",
      code: JSON.stringify({ mcpServers: { vexta: { httpUrl: endpoint, headers: { Authorization: header } } } }, null, 2),
    },
    {
      value: "autre",
      label: "Autre",
      steps:
        "Tout client MCP « Streamable HTTP » : l'adresse du serveur avec l'en-tête Authorization: Bearer et la clé, ou, s'il ne permet pas d'en-tête, l'adresse avec la clé.",
      copy: keyedUrl,
    },
  ];

  return (
    <Field>
      <FieldLabel>Brancher la clé</FieldLabel>
      <Tabs defaultValue="chatgpt">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            {guides.map((guide) => (
              <TabsTrigger key={guide.value} value={guide.value} className="px-2 text-xs">
                {guide.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {guides.map((guide) => (
          <TabsContent key={guide.value} value={guide.value} className="space-y-2">
            <FieldDescription>{guide.steps}</FieldDescription>
            {guide.copy && <CopyField id={`mcp-${guide.value}`} label="Adresse avec la clé" value={guide.copy} />}
            {guide.code && (
              <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">{guide.code}</pre>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Field>
  );
}
