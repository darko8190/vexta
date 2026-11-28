"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/company/toggle-switch";
import { useCompanyProfileQuery, useSaveCompanyProfile, type SaveCompanyValues } from "@/hooks/use-company";
import { pageValues, usePublicPageQuery, useSavePublicPage, type PublicPageValues } from "@/hooks/use-public-page";
import { ApiError } from "@/lib/api";
import { StylePreview } from "@/components/company/style-preview";
import { publicPageStyleOptions } from "@/lib/public-page-style";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";
import type { CompanyProfile, PublicPageSettings } from "@/lib/types";

/**
 * The company card and the public page, one small question at a time. Each form saves what it
 * shows and carries the rest through unchanged, then tells the guide to move on.
 */

type Done = { onDone: () => void };

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner />}
      Enregistrer et continuer
    </Button>
  );
}

function profileValues(profile: CompanyProfile): SaveCompanyValues {
  return {
    name: profile.name,
    description: profile.description,
    contactEmail: profile.contactEmail,
    phone: profile.phone,
    brandColor: profile.brandColor,
    businessNumber: profile.businessNumber,
  };
}

function useSaveProfilePart(profile: CompanyProfile | undefined, onDone: () => void) {
  const save = useSaveCompanyProfile();
  async function run(part: Partial<SaveCompanyValues>) {
    if (!profile) return;
    try {
      await save.mutateAsync({ ...profileValues(profile), ...part });
      toast.success("C'est enregistré.");
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer. Réessayez.");
    }
  }
  return { run, pending: save.isPending };
}

/** Name and description: the two lines every document and the public page start with. */
export function GuidedCompanyName({ onDone }: Done) {
  const { data: profile } = useCompanyProfileQuery();
  if (!profile) return <Skeleton className="h-48 w-full" />;
  return <CompanyNameForm key={profile.id} profile={profile} onDone={onDone} />;
}

function CompanyNameForm({ profile, onDone }: Done & { profile: CompanyProfile }) {
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const { run, pending } = useSaveProfilePart(profile, onDone);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          setNameError("Écrivez le nom de votre entreprise.");
          return;
        }
        void run({ name: name.trim(), description: description.trim() || null });
      }}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel htmlFor="guide-name">Nom de l&apos;entreprise</FieldLabel>
          <Input
            id="guide-name"
            value={name}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />
          <FieldDescription>Le nom que vos clients connaissent. Il est écrit en haut de vos factures.</FieldDescription>
          {nameError && <FieldError>{nameError}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="guide-description">Ce que fait votre entreprise (facultatif)</FieldLabel>
          <Textarea
            id="guide-description"
            rows={3}
            maxLength={2000}
            value={description}
            placeholder={ex("Rénovation de cuisines et de salles de bain à Québec depuis 2010.")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldDescription>Une ou deux phrases suffisent. Vous pourrez la changer quand vous voulez.</FieldDescription>
        </Field>
        <div>
          <SaveButton pending={pending} />
        </div>
      </FieldGroup>
    </form>
  );
}

/** How to reach the company: printed on every invoice and quote. */
export function GuidedCompanyContact({ onDone }: Done) {
  const { data: profile } = useCompanyProfileQuery();
  if (!profile) return <Skeleton className="h-48 w-full" />;
  return <CompanyContactForm key={profile.id} profile={profile} onDone={onDone} />;
}

function CompanyContactForm({ profile, onDone }: Done & { profile: CompanyProfile }) {
  const [email, setEmail] = useState(profile.contactEmail ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [neq, setNeq] = useState(profile.businessNumber ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const { run, pending } = useSaveProfilePart(profile, onDone);

  const emailValid = (value: string) => value.trim() === "" || /^\S+@\S+\.\S+$/.test(value.trim());

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!emailValid(email)) {
          setEmailError("Ce courriel ne semble pas complet, par exemple nom@entreprise.com.");
          return;
        }
        void run({
          contactEmail: email.trim() || null,
          phone: phone.trim() || null,
          businessNumber: neq.trim() || null,
        });
      }}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(emailError)}>
          <FieldLabel htmlFor="guide-email">Courriel de l&apos;entreprise</FieldLabel>
          <Input
            id="guide-email"
            type="email"
            value={email}
            placeholder={ex("info@entreprise.com")}
            aria-invalid={Boolean(emailError)}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            onBlur={() => !emailValid(email) && setEmailError("Ce courriel ne semble pas complet, par exemple nom@entreprise.com.")}
          />
          <FieldDescription>Vos clients y répondent quand ils reçoivent une facture ou une soumission.</FieldDescription>
          {emailError && <FieldError>{emailError}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="guide-phone">Téléphone</FieldLabel>
          <Input
            id="guide-phone"
            type="tel"
            value={phone}
            placeholder={ex("418 555-1234")}
            onChange={(event) => setPhone(event.target.value)}
          />
          <FieldDescription>Le numéro que vos clients appellent.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="guide-neq">Numéro d&apos;entreprise (facultatif)</FieldLabel>
          <Input id="guide-neq" value={neq} placeholder={ex("1234567890")} onChange={(event) => setNeq(event.target.value)} />
          <FieldDescription>Au Québec, c&apos;est le NEQ. Laissez vide si vous ne l&apos;avez pas.</FieldDescription>
        </Field>
        <div>
          <SaveButton pending={pending} />
        </div>
      </FieldGroup>
    </form>
  );
}


function usePublicPagePart(settings: PublicPageSettings | undefined, onDone: () => void) {
  const save = useSavePublicPage();
  async function run(part: Partial<PublicPageValues>, message = "C'est enregistré.") {
    if (!settings) return;
    try {
      await save.mutateAsync({ ...pageValues(settings), ...part });
      toast.success(message);
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer. Réessayez.");
    }
  }
  return { run, pending: save.isPending };
}

function WithPublicPage({ children }: { children: (settings: PublicPageSettings) => React.ReactNode }) {
  const { data: settings } = usePublicPageQuery();
  if (!settings) return <Skeleton className="h-48 w-full" />;
  return <>{children(settings)}</>;
}

/** The words on the page: a headline, a paragraph about the company, how to reach it. */
export function GuidedPublicText({ onDone }: Done) {
  return <WithPublicPage>{(settings) => <PublicTextForm key={settings.slug} settings={settings} onDone={onDone} />}</WithPublicPage>;
}

function PublicTextForm({ settings, onDone }: Done & { settings: PublicPageSettings }) {
  const [headline, setHeadline] = useState(settings.headline ?? "");
  const [about, setAbout] = useState(settings.about ?? "");
  const [contactNote, setContactNote] = useState(settings.contactNote ?? "");
  const { run, pending } = usePublicPagePart(settings, onDone);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run({ headline: headline.trim() || null, about: about.trim() || null, contactNote: contactNote.trim() || null });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="guide-headline">Phrase d&apos;accroche</FieldLabel>
          <Input
            id="guide-headline"
            maxLength={200}
            value={headline}
            placeholder={ex("Des rénovations faites dans les temps, sans mauvaise surprise.")}
            onChange={(event) => setHeadline(event.target.value)}
          />
          <FieldDescription>Une courte phrase sous votre nom, la première chose qu&apos;un visiteur lit.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="guide-about">À propos de vous</FieldLabel>
          <Textarea
            id="guide-about"
            rows={5}
            maxLength={4000}
            value={about}
            placeholder={ex("Depuis 2010, notre équipe de cinq personnes rénove les cuisines de la région…")}
            onChange={(event) => setAbout(event.target.value)}
          />
          <FieldDescription>
            Racontez qui vous êtes, ce que vous faites et où vous travaillez. Écrivez comme si vous parliez à un client.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="guide-contact-note">Comment vous joindre (facultatif)</FieldLabel>
          <Textarea
            id="guide-contact-note"
            rows={2}
            maxLength={1000}
            value={contactNote}
            placeholder={ex("Appelez-nous du lundi au vendredi, de 8 h à 17 h.")}
            onChange={(event) => setContactNote(event.target.value)}
          />
          <FieldDescription>Vos heures, ou la meilleure façon de vous contacter. Votre courriel et votre téléphone sont déjà affichés.</FieldDescription>
        </Field>
        <div>
          <SaveButton pending={pending} />
        </div>
      </FieldGroup>
    </form>
  );
}

/** What else the page shows, each said in plain words. */
export function GuidedPublicContent({ onDone }: Done) {
  return <WithPublicPage>{(settings) => <PublicContentForm key={settings.slug} settings={settings} onDone={onDone} />}</WithPublicPage>;
}

function PublicContentForm({ settings, onDone }: Done & { settings: PublicPageSettings }) {
  const [showProducts, setShowProducts] = useState(settings.showProducts);
  const [acceptsOrders, setAcceptsOrders] = useState(settings.acceptsOrders);
  const [showJobs, setShowJobs] = useState(settings.showJobs);
  const [showForms, setShowForms] = useState(settings.showForms);
  const { run, pending } = usePublicPagePart(settings, onDone);

  const options = [
    {
      id: "guide-show-products",
      checked: showProducts,
      set: (value: boolean) => {
        setShowProducts(value);
        if (!value) setAcceptsOrders(false);
      },
      label: "Montrer mes produits",
      hint: "Les produits de votre catalogue marqués comme visibles, avec leur prix.",
    },
    {
      id: "guide-accepts-orders",
      checked: acceptsOrders,
      set: setAcceptsOrders,
      label: "Laisser les visiteurs commander mes produits",
      hint: "Ils pourront passer une commande depuis votre page. Vous la recevez dans Vexta.",
      disabled: !showProducts,
    },
    {
      id: "guide-show-jobs",
      checked: showJobs,
      set: setShowJobs,
      label: "Montrer mes offres d'emploi",
      hint: "Les postes que vous affichez, pour que les gens puissent postuler.",
    },
    {
      id: "guide-show-forms",
      checked: showForms,
      set: setShowForms,
      label: "Montrer mes formulaires",
      hint: "Par exemple une demande de soumission que vos clients remplissent eux-mêmes.",
    },
  ];

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run({ showProducts, acceptsOrders, showJobs, showForms, requiresOnlinePayment: acceptsOrders && settings.requiresOnlinePayment });
      }}
    >
      <FieldGroup>
        {options.map((option) => (
          <Field key={option.id} orientation="horizontal" data-disabled={option.disabled}>
            <Checkbox
              id={option.id}
              checked={option.checked}
              disabled={option.disabled}
              onCheckedChange={(value) => option.set(value === true)}
            />
            <div>
              <FieldLabel htmlFor={option.id}>{option.label}</FieldLabel>
              <FieldDescription>{option.hint}</FieldDescription>
            </div>
          </Field>
        ))}
        <div>
          <SaveButton pending={pending} />
        </div>
      </FieldGroup>
    </form>
  );
}

/** The look of the page: the same content, laid out differently. */
export function GuidedPublicStyle({ onDone }: Done) {
  return <WithPublicPage>{(settings) => <PublicStyleForm key={settings.slug} settings={settings} onDone={onDone} />}</WithPublicPage>;
}

function PublicStyleForm({ settings, onDone }: Done & { settings: PublicPageSettings }) {
  const [style, setStyle] = useState(settings.style);
  const { run, pending } = usePublicPagePart(settings, onDone);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run({ style });
      }}
    >
      <FieldGroup>
        <div role="radiogroup" aria-label="Style de la page" className="grid gap-2 sm:grid-cols-2">
          {publicPageStyleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={style === option.value}
              onClick={() => setStyle(option.value)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                style === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
            >
              <StylePreview style={option.value} />
              <span className="mt-2 block text-sm font-medium text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
        <div>
          <SaveButton pending={pending} />
        </div>
      </FieldGroup>
    </form>
  );
}

/** Putting the page online, with a way to look at it first. */
export function GuidedPublish({ onDone }: Done) {
  return <WithPublicPage>{(settings) => <PublishForm settings={settings} onDone={onDone} />}</WithPublicPage>;
}

function PublishForm({ settings, onDone }: Done & { settings: PublicPageSettings }) {
  const { run, pending } = usePublicPagePart(settings, () => undefined);
  const url = `/e/${settings.slug}`;

  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <ToggleSwitch
          id="guide-publish"
          checked={settings.isPublished}
          disabled={pending}
          onCheckedChange={(isPublished) =>
            void run({ isPublished }, isPublished ? "Votre page est en ligne." : "Votre page est hors ligne.")
          }
        />
        <div>
          <FieldLabel htmlFor="guide-publish">{settings.isPublished ? "Ma page est en ligne" : "Ma page est hors ligne"}</FieldLabel>
          <FieldDescription>
            Hors ligne, personne ne la voit. Vous pouvez la mettre en ligne maintenant ou plus tard.
          </FieldDescription>
        </div>
      </Field>
      <p className="text-sm text-muted-foreground">
        Adresse de votre page :{" "}
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {typeof window === "undefined" ? url : `${window.location.host}${url}`}
          <ExternalLink className="size-3.5" />
        </a>
      </p>
      <div>
        <Button type="button" onClick={onDone}>
          Continuer
        </Button>
      </div>
    </FieldGroup>
  );
}
