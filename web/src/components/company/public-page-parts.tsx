"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { pageValues, usePublicPageQuery, useSavePublicPage, type PublicPageValues } from "@/hooks/use-public-page";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";
import type { PublicPageSettings } from "@/lib/types";

/** Reads the page, then hands it to the form; a form seeded from nothing would save nothing. */
function WithSettings({ children }: { children: (settings: PublicPageSettings) => React.ReactNode }) {
  const { data: settings, isLoading, error } = usePublicPageQuery();

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!settings) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Page publique indisponible</AlertTitle>
        <AlertDescription>
          {error instanceof ApiError ? error.message : "Impossible de charger votre page publique."}
        </AlertDescription>
      </Alert>
    );
  }
  return <>{children(settings)}</>;
}

/** Saves this part of the page and leaves every other part exactly as it was. */
function useSavePart(settings: PublicPageSettings) {
  const save = useSavePublicPage();
  async function run(part: Partial<PublicPageValues>, message: string) {
    try {
      await save.mutateAsync({ ...pageValues(settings), ...part });
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer.");
    }
  }
  return { run, pending: save.isPending };
}

function Check({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <FieldLabel htmlFor={id} className="font-normal">
        {children}
      </FieldLabel>
    </Field>
  );
}

/** The head of the public page: the logo, and the accroche under the name. */
export function PublicHeaderSection() {
  return <WithSettings>{(settings) => <HeaderForm key={settings.updatedAt ?? "neuf"} settings={settings} />}</WithSettings>;
}

function HeaderForm({ settings }: { settings: PublicPageSettings }) {
  const { run, pending } = useSavePart(settings);
  const [showLogo, setShowLogo] = useState(settings.showLogo);
  const [headline, setHeadline] = useState(settings.headline ?? "");
  const [showHeadline, setShowHeadline] = useState(settings.showHeadline);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">En-tête</CardTitle>
        <CardDescription>
          Le haut de votre page : votre logo, votre nom et votre accroche, dans votre couleur.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Check id="header-logo" checked={showLogo} onChange={setShowLogo}>
            Afficher mon logo
          </Check>
          <p className="-mt-3 text-sm text-muted-foreground">
            Le logo et la couleur se changent dans{" "}
            <Link href="/parametres?section=entreprise" className="underline underline-offset-4">
              Entreprise
            </Link>
            .
          </p>

          <Field>
            <FieldLabel htmlFor="header-headline">Accroche</FieldLabel>
            <Input
              id="header-headline"
              value={headline}
              maxLength={200}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder={ex("Rénovation résidentielle à Québec depuis 2008")}
            />
            <FieldDescription>La phrase sous votre nom, qui dit ce que vous faites.</FieldDescription>
          </Field>
          <Check id="header-show-headline" checked={showHeadline} onChange={setShowHeadline}>
            Afficher l&apos;accroche
          </Check>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          onClick={() =>
            void run({ showLogo, headline: headline.trim() || null, showHeadline }, "En-tête enregistré.")
          }
        >
          {pending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The foot of the public page: how to reach the company, and a last line under everything. */
export function PublicFooterSection() {
  return <WithSettings>{(settings) => <FooterForm key={settings.updatedAt ?? "neuf"} settings={settings} />}</WithSettings>;
}

function FooterForm({ settings }: { settings: PublicPageSettings }) {
  const { run, pending } = useSavePart(settings);
  const [footerTitle, setFooterTitle] = useState(settings.footerTitle ?? "");
  const [contactNote, setContactNote] = useState(settings.contactNote ?? "");
  const [showAddress, setShowAddress] = useState(settings.footerShowAddress);
  const [showPhone, setShowPhone] = useState(settings.footerShowPhone);
  const [showEmail, setShowEmail] = useState(settings.footerShowEmail);
  const [footerText, setFooterText] = useState(settings.footerText ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pied de page</CardTitle>
        <CardDescription>Le bas de votre page : comment vous joindre.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="footer-title">Titre</FieldLabel>
            <Input
              id="footer-title"
              value={footerTitle}
              maxLength={100}
              onChange={(event) => setFooterTitle(event.target.value)}
              placeholder="Nous joindre"
            />
            <FieldDescription>Vide, le titre est « Nous joindre ».</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="footer-note">Note de contact</FieldLabel>
            <Textarea
              id="footer-note"
              rows={3}
              value={contactNote}
              maxLength={1000}
              onChange={(event) => setContactNote(event.target.value)}
              placeholder={ex("Appelez-nous du lundi au vendredi, de 7 h à 17 h.")}
            />
            <FieldDescription>Ce qu&apos;un visiteur devrait faire pour vous joindre.</FieldDescription>
          </Field>

          <div className="grid gap-3">
            <Check id="footer-address" checked={showAddress} onChange={setShowAddress}>
              Afficher mon adresse
            </Check>
            <Check id="footer-phone" checked={showPhone} onChange={setShowPhone}>
              Afficher mon téléphone
            </Check>
            <Check id="footer-email" checked={showEmail} onChange={setShowEmail}>
              Afficher mon courriel
            </Check>
            <p className="text-sm text-muted-foreground">
              L&apos;adresse, le téléphone et le courriel viennent de la fiche{" "}
              <Link href="/parametres?section=entreprise" className="underline underline-offset-4">
                Entreprise
              </Link>
              .
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="footer-text">Dernière ligne</FieldLabel>
            <Textarea
              id="footer-text"
              rows={2}
              value={footerText}
              maxLength={1000}
              onChange={(event) => setFooterText(event.target.value)}
              placeholder={ex("Licence RBQ 1234-5678-90 · © 2026 Toitures Gagnon")}
            />
            <FieldDescription>Tout en bas de la page, en petit. Un numéro de licence, vos heures.</FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          onClick={() =>
            void run(
              {
                footerTitle: footerTitle.trim() || null,
                contactNote: contactNote.trim() || null,
                footerShowAddress: showAddress,
                footerShowPhone: showPhone,
                footerShowEmail: showEmail,
                footerText: footerText.trim() || null,
              },
              "Pied de page enregistré.",
            )
          }
        >
          {pending && <Spinner />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}
