"use client";

import { useRef, useState } from "react";
import { Bug, ImagePlus, Lightbulb, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/** The API's limits, so the dialog refuses before the round trip does. */
const MAX_MESSAGE = 5000;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

type Kind = "bug" | "suggestion";

const kinds: { value: Kind; label: string; icon: typeof Bug; placeholder: string }[] = [
  {
    value: "bug",
    label: "Signaler un bogue",
    icon: Bug,
    placeholder: "Ce que vous faisiez, ce qui s'est passé, et ce à quoi vous vous attendiez.",
  },
  {
    value: "suggestion",
    label: "Proposer une amélioration",
    icon: Lightbulb,
    placeholder: "Ce qui vous aiderait, ou ce qui pourrait être fait autrement.",
  },
];

/**
 * The bug button in the app's top bar: a bug report or a suggestion, e-mailed to Vexta's team
 * with who sent it, from which space and which page. Only inside a company's or a person's own
 * space — never for a client, and not for the super admin, who would be writing to themselves.
 */
export function FeedbackButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user || user.role === "Client" || user.role === "SuperAdmin") return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Signaler un bogue ou proposer une amélioration" />
          }
          onClick={() => setOpen(true)}
        >
          <Bug className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Signaler un bogue ou proposer une amélioration</TooltipContent>
      </Tooltip>
      {/* Mounted only while open, so every opening starts from a clean form. */}
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<{ name: string; dataUrl: string } | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = kinds.find((k) => k.value === kind)!;
  const trimmed = message.trim();

  function pickScreenshot(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Choisissez une image PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("L'image dépasse 5 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function send() {
    setSending(true);
    try {
      await api.post("feedback", {
        kind,
        message: trimmed,
        pageUrl: window.location.href,
        screenshot: screenshot?.dataUrl ?? null,
      });
      toast.success(kind === "bug" ? "Merci, le bogue a été envoyé à l'équipe Vexta." : "Merci, votre suggestion a été envoyée à l'équipe Vexta.");
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "L'envoi a échoué. Réessayez dans quelques minutes.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Écrire à l&apos;équipe Vexta</DialogTitle>
          <DialogDescription>
            Votre message nous arrive par courriel avec votre nom, votre espace et la page où vous
            êtes, pour qu&apos;on puisse vous répondre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de message">
          {kinds.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => setKind(option.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                kind === option.value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <option.icon className="size-4 shrink-0" />
              {option.label}
            </button>
          ))}
        </div>

        <Field>
          <FieldLabel htmlFor="feedback-message">
            {kind === "bug" ? "Description du bogue" : "Votre suggestion"}
          </FieldLabel>
          <Textarea
            id="feedback-message"
            rows={6}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={current.placeholder}
            autoFocus
          />
          <FieldDescription>
            {message.length > MAX_MESSAGE - 500 ? `${message.length} / ${MAX_MESSAGE} caractères` : "La page actuelle est jointe automatiquement."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Capture d&apos;écran (facultatif)</FieldLabel>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              pickScreenshot(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {screenshot ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
              <img src={screenshot.dataUrl} alt="" className="size-12 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm">{screenshot.name}</span>
              <Button variant="ghost" size="icon" aria-label="Retirer la capture" onClick={() => setScreenshot(null)}>
                <X />
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-fit" onClick={() => fileInput.current?.click()}>
              <ImagePlus />
              Joindre une image
            </Button>
          )}
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Annuler
          </Button>
          <Button onClick={send} disabled={sending || trimmed.length === 0}>
            {sending && <Spinner />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
