"use client";

import { useEffect } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { BriefcaseBusiness, ExternalLink, Globe, Info } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/company/toggle-switch";
import { usePublicPageQuery, useSavePublicPage } from "@/hooks/use-public-page";
import { ApiError } from "@/lib/api";
import { publicPageStyleOptions } from "@/lib/public-page-style";
import { cn } from "@/lib/utils";
import type { PublicPageSettings } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  headline: z.string().trim().max(200, "200 caractères maximum."),
  about: z.string().trim().max(4000, "4000 caractères maximum."),
  contactNote: z.string().trim().max(1000, "1000 caractères maximum."),
  showProducts: z.boolean(),
  showJobs: z.boolean(),
  style: z.enum(["Classique", "Chantier", "Epure", "Vitrine", "Journal", "Panneau", "Affiche"]),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(settings?: PublicPageSettings): FormValues {
  return {
    headline: settings?.headline ?? "",
    about: settings?.about ?? "",
    contactNote: settings?.contactNote ?? "",
    showProducts: settings?.showProducts ?? true,
    showJobs: settings?.showJobs ?? true,
    style: settings?.style ?? "Classique",
  };
}

/**
 * The switch and the address, kept apart from the text below it.
 *
 * It saves the moment it is flipped rather than waiting for the form: publishing is not a draft
 * change, it is the act of putting the page in front of the world, and an owner who turned it
 * off and walked away must not come back to find it still up because they missed a button.
 */
function PublishCard({ settings }: { settings: PublicPageSettings }) {
  const save = useSavePublicPage();
  const url = `/e/${settings.slug}`;

  async function onToggle(isPublished: boolean) {
    try {
      await save.mutateAsync({
        isPublished,
        headline: settings.headline,
        about: settings.about,
        contactNote: settings.contactNote,
        showProducts: settings.showProducts,
        showJobs: settings.showJobs,
        // Carried through unchanged: this switch publishes the page, and leaving the style out
        // would reset the company's choice every time it went online.
        style: settings.style,
      });
      toast.success(isPublished ? "Votre page est en ligne." : "Votre page est hors ligne.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de changer la publication.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4" />
          Publication
        </CardTitle>
        <CardDescription>
          Votre page publique est la seule page de Vexta qu&apos;une personne sans compte peut voir.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="public-page-published" className="text-sm font-medium text-foreground">
              Page publique en ligne
            </label>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.isPublished
                ? "Tout le monde peut consulter votre page."
                : "Personne ne peut la consulter pour le moment."}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {save.isPending && <Spinner className="size-4" />}
            {/* Said in words as well as by the knob's position. A switch is only readable to
                somebody who already knows which side is on, and this one decides whether the
                company has a page on the internet. */}
            <span
              className={cn(
                "text-sm font-medium",
                settings.isPublished ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {settings.isPublished ? "En ligne" : "Hors ligne"}
            </span>
            <ToggleSwitch
              id="public-page-published"
              checked={settings.isPublished}
              disabled={save.isPending}
              onCheckedChange={onToggle}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">Adresse de votre page</p>
          {/* A real link even when the page is off, so the owner can see what it will say. */}
          <Link
            href={url}
            className="mt-0.5 block truncate text-sm font-medium text-primary hover:underline"
          >
            {url}
          </Link>
        </div>
      </CardContent>

      {settings.isPublished && (
        <CardFooter>
          <Link
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ExternalLink />
            Voir la page
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

function ContentCard({ settings }: { settings: PublicPageSettings }) {
  const save = useSavePublicPage();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(settings),
  });

  useEffect(() => {
    form.reset(toFormValues(settings));
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        // Left exactly as the switch above set it: this form writes the text, not the decision
        // to publish.
        isPublished: settings.isPublished,
        headline: values.headline || null,
        about: values.about || null,
        contactNote: values.contactNote || null,
        showProducts: values.showProducts,
        showJobs: values.showJobs,
        style: values.style,
      });
      toast.success("Page publique mise à jour.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la page.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contenu</CardTitle>
        <CardDescription>Ce qu&apos;un visiteur lit en arrivant sur votre page.</CardDescription>
      </CardHeader>

      <form id="public-page-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <Controller
              name="headline"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="public-headline">Accroche</FieldLabel>
                  <Input
                    {...field}
                    id="public-headline"
                    placeholder={ex("Rénovation résidentielle à Québec depuis 2008")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      La ligne en haut de la page. Sans elle, c&apos;est le nom de
                      l&apos;entreprise qui s&apos;affiche.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="about"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="public-about">À propos</FieldLabel>
                  <Textarea
                    {...field}
                    id="public-about"
                    rows={6}
                    placeholder={ex("Ce que vous faites, pour qui, et depuis combien de temps.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="contactNote"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="public-contact-note">Note de contact</FieldLabel>
                  <Textarea
                    {...field}
                    id="public-contact-note"
                    rows={3}
                    placeholder={ex("Appelez-nous du lundi au vendredi, de 7 h à 17 h.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Ce qu&apos;un visiteur devrait faire pour vous joindre.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <div className="grid gap-3">
              <Controller
                name="showProducts"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="public-show-products"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="public-show-products">Afficher mes produits</FieldLabel>
                  </Field>
                )}
              />
              <Controller
                name="showJobs"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="public-show-jobs"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="public-show-jobs">Afficher mes offres d&apos;emploi</FieldLabel>
                  </Field>
                )}
              />
              <FieldDescription>
                Une section décochée est masquée sans être vidée.
              </FieldDescription>
            </div>

            <Controller
              name="style"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Style visuel</FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {publicPageStyleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => field.onChange(option.value)}
                        aria-pressed={field.value === option.value}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          field.value === option.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="block text-sm font-medium text-foreground">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                  <FieldDescription>
                    Les quatre utilisent votre couleur et votre logo. Seule la mise en page change.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>

        <CardFooter>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** Where the owner writes the company's public page and lists the positions it is hiring for. */
export function PublicPageSection() {
  const { data: settings, isLoading, error } = usePublicPageQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

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

  return (
    <div className="space-y-4">
      <PublishCard settings={settings} />
      <ContentCard settings={settings} />

      <Alert>
        <Info />
        <AlertTitle>Comment un produit arrive sur la page</AlertTitle>
        <AlertDescription>
          Ouvrez le produit dans votre catalogue et cochez « Visible sur la page publique ». Les
          produits cochés apparaissent ici tant que la section est affichée.
        </AlertDescription>
      </Alert>

      {/* A pointer, not a second table. The postings used to be editable here as well as in
          Ressources humaines, and the two screens knew different things about the same rows:
          this one could publish a position it could not see had been filled. One authority,
          and it is the one that also holds the applications. */}
      <Alert>
        <BriefcaseBusiness />
        <AlertTitle>Les offres d&apos;emplois se gèrent aux ressources humaines</AlertTitle>
        <AlertDescription>
          <p>
            Une offre publiée paraît ici tant que la section est affichée. Son état, ses postes à
            combler et les candidatures reçues vivent au même endroit.
          </p>
          <Link
            href="/ressources-humaines"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
          >
            Ouvrir les offres d&apos;emplois
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
