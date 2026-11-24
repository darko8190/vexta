"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Eye, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  type AssistantUsage,
  useAskAssistant,
  useAssistantAvailabilityQuery,
  type AssistantAction,
  type AssistantTurn,
} from "@/hooks/use-assistant";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * What the assistant did, under the answer it gave.
 *
 * Shown rather than hidden because this is a thing that acts: somebody who has just been told
 * "c'est fait" is entitled to see which door it went through, and a refusal is more useful
 * visible than swallowed.
 */
function Actions({ actions }: { actions: AssistantAction[] }) {
  if (actions.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1 border-t border-border pt-2">
      {actions.map((action, index) => (
        <li key={index} className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span
            className={cn(
              "shrink-0 rounded px-1 py-px",
              action.method === "GET" ? "bg-muted" : "bg-primary/10 text-primary",
            )}
          >
            {action.method}
          </span>
          <span className="truncate">{action.path}</span>
          <span
            className={cn(
              "ml-auto shrink-0",
              action.summary === "ok" ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {action.summary}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Entry extends AssistantTurn {
  actions?: AssistantAction[];
}

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: availability } = useAssistantAvailabilityQuery(open);
  const ask = useAskAssistant();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // The only effect here, and it is about the viewport rather than about state: a new answer
  // that lands below the fold reads as nothing having happened.
  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, open]);

  async function send() {
    const text = draft.trim();
    if (!text || ask.isPending) return;

    const history: AssistantTurn[] = [
      ...entries.map(({ role, text: body }) => ({ role, text: body })),
      { role: "user", text },
    ];

    setEntries((current) => [...current, { role: "user", text }]);
    setDraft("");

    try {
      const reply = await ask.mutateAsync(history);
      setEntries((current) => [
        ...current,
        { role: "assistant", text: reply.text, actions: reply.actions },
      ]);
    } catch (error) {
      // Kept in the thread rather than thrown into a toast: the question is still on screen
      // above it, and the two belong together.
      setEntries((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error instanceof ApiError
              ? error.message
              : "La demande n'a pas abouti. Réessayez dans un instant.",
        },
      ]);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent layout="panel" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Assistant
            </SheetTitle>
            {availability && (
              <Badge variant={availability.canWrite ? "default" : "secondary"}>
                {availability.canWrite ? (
                  <>
                    <Pencil />
                    Peut modifier
                  </>
                ) : (
                  <>
                    <Eye />
                    Lecture seule
                  </>
                )}
              </Badge>
            )}
          </div>
          <SheetDescription>
            Il travaille avec vos droits et ne voit que ce que vous verriez. Il ne peut rien
            supprimer.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {entries.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              <p className="mb-2 text-foreground">Par exemple :</p>
              <ul className="space-y-1">
                <li>« Combien de factures impayées, et pour quel montant ? »</li>
                <li>« Trouve-moi le dossier de Constructions Tremblay. »</li>
                <li>« Crée un client particulier : Marie Gagnon, 581 555-0190. »</li>
                <li>« Quels permis expirent dans les trois prochains mois ? »</li>
              </ul>
            </div>
          )}

          {entries.map((entry, index) => (
            <div
              key={index}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                entry.role === "user"
                  ? "ml-8 bg-primary/10 text-foreground"
                  : "mr-4 border border-border bg-card text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap">{entry.text}</p>
              {entry.actions && <Actions actions={entry.actions} />}
            </div>
          ))}

          {ask.isPending && (
            <p className="mr-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              <Spinner />
              Je regarde…
            </p>
          )}

          <div ref={bottom} />
        </div>

        <div className="border-t border-border p-4">
          {availability && !availability.available ? (
            <p className="text-sm text-muted-foreground">
              {availability.reason}{" "}
              <Link href="/parametres" className="text-foreground underline underline-offset-2">
                Ouvrir les paramètres
              </Link>
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter makes a line. A question is one line far more
                  // often than it is three, and reaching for a button each time is a tax on
                  // the common case.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Posez votre question…"
                aria-label="Message à l'assistant"
                className="min-h-0 resize-none"
              />
              <Button
                size="icon"
                aria-label="Envoyer"
                onClick={send}
                disabled={ask.isPending || draft.trim().length === 0}
              >
                <ArrowUp />
              </Button>
            </div>
          )}

          {entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setEntries([])}
            >
              <Trash2 />
              Effacer la conversation
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The button in the header, and the panel it opens.
 *
 * Draws nothing at all unless the company has an assistant switched on. A button that explains
 * why it cannot work is still a button somebody presses twice before reading it.
 */
export function AssistantButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Only the people who work there. A customer signed in to see their own invoices has no
  // assistant, a super admin outside a company has no company for one to work in, and a
  // personal space has nothing for it to do — and in each case the endpoint would refuse,
  // which is a failed request on every page load rather than a button that is simply absent.
  const eligible =
    Boolean(user) &&
    user!.role !== "Client" &&
    user!.tenantKind !== "Personal" &&
    (user!.role !== "SuperAdmin" || user!.isImpersonating);

  const { data } = useAssistantAvailabilityQuery(eligible);

  if (!eligible || !data?.available) return null;

  return (
    <>
      <AssistantSpend usage={data.usage} />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ouvrir l'assistant"
        onClick={() => setOpen(true)}
      >
        <Sparkles />
      </Button>
      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * What the assistant has cost this month, beside the button that spends it.
 *
 * In dollars once the company has entered what its provider charges per million tokens, and in
 * tokens until then. Tokens are not the question anybody asked, but they are true, and they are
 * better than a dollar figure worked out from a price nobody gave us — the company is billed by
 * Anthropic or OpenAI directly, on a rate we never see.
 *
 * Hidden below sm: a phone header has room for two controls, and this is a figure you consult
 * rather than one you watch.
 */
function AssistantSpend({ usage }: { usage: AssistantUsage | null }) {
  if (!usage) return null;

  const tokens = usage.inputTokens + usage.outputTokens;
  if (tokens === 0) return null;

  const label =
    usage.cost != null
      ? usage.cost.toLocaleString("fr-CA", { style: "currency", currency: "USD" })
      : `${Math.round(tokens / 1000).toLocaleString("fr-CA")} k jetons`;

  return (
    <span
      className="hidden items-center rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums sm:inline-flex"
      title={
        usage.cost != null
          ? "Ce que l'assistant a coûté ce mois-ci, selon les prix que vous avez inscrits."
          : "Jetons consommés ce mois-ci. Inscrivez vos prix dans Paramètres → Assistant IA pour voir un montant."
      }
    >
      {label}
    </span>
  );
}
