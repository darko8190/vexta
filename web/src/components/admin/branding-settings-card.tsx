"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  BRANDING_ACCEPT,
  BRANDING_MAX_BYTES,
  useResetBranding,
  useUploadBranding,
} from "@/hooks/use-branding";
import { ApiError } from "@/lib/api";
import type { BrandingSlot, BrandingSlotInfo } from "@/lib/types";

const SLOTS: {
  slot: BrandingSlot;
  label: string;
  description: string;
  /** The preview sits on the surface the artwork is meant for, or it cannot be judged. */
  previewClassName: string;
  imageClassName: string;
}[] = [
  {
    slot: "logo-light",
    label: "Logo — thème clair",
    description: "Affiché sur fond pâle : en-tête du site public et page de connexion.",
    previewClassName: "bg-white",
    imageClassName: "max-h-16 w-auto",
  },
  {
    slot: "logo-dark",
    label: "Logo — thème sombre",
    description: "La même image déclinée pour un fond foncé.",
    previewClassName: "bg-neutral-900",
    imageClassName: "max-h-16 w-auto",
  },
  {
    slot: "icon",
    label: "Icône",
    description: "Barre latérale de l'application et onglet du navigateur. Format carré.",
    previewClassName: "bg-muted",
    imageClassName: "size-12 rounded-lg object-contain",
  },
];

export function BrandingSettingsCard({ branding }: { branding: BrandingSlotInfo[] }) {
  const upload = useUploadBranding();
  const reset = useResetBranding();

  // One input for all three rows. Two inputs sharing a ref would leave the second one unwired,
  // so the slot being changed is tracked separately instead.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<BrandingSlot | null>(null);

  function choose(slot: BrandingSlot) {
    setPendingSlot(slot);
    fileInputRef.current?.click();
  }

  async function onFileChosen(file: File | undefined) {
    const slot = pendingSlot;
    // Lets the same file be chosen again right after a failure.
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingSlot(null);

    if (!file || !slot) return;

    if (file.size > BRANDING_MAX_BYTES) {
      toast.error("L'image ne doit pas dépasser 2 Mo.");
      return;
    }

    try {
      await upload.mutateAsync({ slot, file });
      toast.success("Image enregistrée. Elle apparaît partout d'ici une minute.");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer cette image.",
      );
    }
  }

  async function onReset(slot: BrandingSlot) {
    try {
      await reset.mutateAsync(slot);
      toast.success("Image d'origine rétablie.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de rétablir l'image.");
    }
  }

  const busy = upload.isPending || reset.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="size-4" />
          Logo et icône
        </CardTitle>
        <CardDescription>
          Remplacez l&apos;image de marque de la plateforme. Sans envoi, Vexta utilise celle
          configurée dans l&apos;environnement du serveur. PNG, JPEG, WebP, SVG ou ICO, 2 Mo
          maximum.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <input
          ref={fileInputRef}
          type="file"
          accept={BRANDING_ACCEPT}
          className="hidden"
          onChange={(event) => onFileChosen(event.target.files?.[0])}
        />

        {SLOTS.map(({ slot, label, description, previewClassName, imageClassName }) => {
          const info = branding.find((entry) => entry.slot === slot);

          return (
            <div
              key={slot}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex size-20 shrink-0 items-center justify-center rounded-lg border border-border p-2 ${previewClassName}`}
                >
                  {/* The ETag in the query string is what makes a freshly uploaded image show
                      here at once, despite the route's cache headers. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- the optimiser
                      caches by URL and would keep showing the previous logo after an upload. */}
                  <img
                    src={`/branding/${slot}?v=${info?.eTag ?? "defaut"}`}
                    alt={label}
                    className={imageClassName}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    {info?.isUploaded ? (
                      <Badge variant="secondary">Personnalisée</Badge>
                    ) : (
                      <Badge variant="outline">Par défaut</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => choose(slot)}>
                  {busy && pendingSlot === slot ? <Spinner /> : <Upload />}
                  Remplacer
                </Button>

                {info?.isUploaded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onReset(slot)}
                  >
                    <RotateCcw />
                    Rétablir
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
