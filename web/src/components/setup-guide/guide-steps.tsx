"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoCard } from "@/components/company/company-info-section";
import { GalleriesSection } from "@/components/company/galleries-section";
import { LocationsSection } from "@/components/hr/locations-section";
import { AiAssistantCard } from "@/components/settings/ai-assistant-card";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { BrandColorCard } from "@/components/settings/brand-color-card";
import { EmailTemplateCard } from "@/components/settings/email-template-card";
import { HourlyRateCard } from "@/components/settings/hourly-rate-card";
import { InvoiceAutoFeesCard } from "@/components/settings/invoice-auto-fees-card";
import { MarginModeCard } from "@/components/settings/margin-mode-card";
import { McpKeysCard } from "@/components/settings/mcp-keys-card";
import { OnlinePaymentsCard } from "@/components/settings/online-payments-card";
import { PayPalCard } from "@/components/settings/paypal-card";
import { PricePoliciesCard } from "@/components/settings/price-policies-card";
import { InvoiceReminderCard, QuoteReminderCard, QuoteTermsCard } from "@/components/settings/quote-settings-cards";
import { QuoteResponsesCard } from "@/components/settings/quote-responses-card";
import { MenuVisibilityCard } from "@/components/settings/menu-visibility-card";
import { WageClassificationsCard } from "@/components/settings/wage-classifications-card";
import {
  GuidedCompanyContact,
  GuidedCompanyName,
  GuidedPublicContent,
  GuidedPublicStyle,
  GuidedPublicText,
  GuidedPublish,
} from "@/components/setup-guide/guided-forms";
import { useCompanyProfileQuery } from "@/hooks/use-company";
import type { GuideAnswer } from "@/hooks/use-setup-guide";

/**
 * Every step of the setup guide, in order.
 *
 * EVERY NEW SETTING GETS A STEP HERE. Write it for somebody who has never used a management
 * application: a question they can answer, a few words on why it matters, and an example.
 *
 * - `ask` turns the step into a yes/no question first. "Oui" shows the form, "Non" moves on.
 *   A step with `ask` and no `render` only records the answer, for the steps after it to read
 *   through `when`.
 * - `selfAdvancing` marks a form that saves and moves on by itself (it calls `onDone`). Without
 *   it the form is an ordinary settings card with its own save button, and the guide shows a
 *   Continuer button below it.
 * - The key is stored with the owner's progress: never rename one, or the step reads as new.
 */
export interface GuideStep {
  key: string;
  /** The heading the step is listed under. */
  group: string;
  /** Short, for the list of steps. */
  title: string;
  /** The question asked, in plain words. */
  question: string;
  /** Why it matters, said simply. One or two short paragraphs. */
  explain: ReactNode;
  ask?: { yes: string; no: string; /** Said when the answer is no, so nobody wonders what happens. */ noNote?: string };
  when?: (answers: Record<string, GuideAnswer>) => boolean;
  render?: (props: { onDone: () => void }) => ReactNode;
  selfAdvancing?: boolean;
}

function WithProfile({ children }: { children: (profile: NonNullable<ReturnType<typeof useCompanyProfileQuery>["data"]>) => ReactNode }) {
  const { data } = useCompanyProfileQuery();
  return data ? <>{children(data)}</> : <Skeleton className="h-40 w-full" />;
}

const wantsPublicPage = (answers: Record<string, GuideAnswer>) => answers["page-publique"] === "oui";

export const guideSteps: GuideStep[] = [
  // ---- Votre entreprise ----
  {
    key: "entreprise-nom",
    group: "Votre entreprise",
    title: "Nom et description",
    question: "Comment s'appelle votre entreprise ?",
    explain: "Ce nom apparaît en haut de vos factures, de vos soumissions et de vos courriels. Ajoutez une phrase pour dire ce que vous faites.",
    render: ({ onDone }) => <GuidedCompanyName onDone={onDone} />,
    selfAdvancing: true,
  },
  {
    key: "entreprise-contact",
    group: "Votre entreprise",
    title: "Coordonnées",
    question: "Comment vos clients peuvent-ils vous joindre ?",
    explain: "Votre courriel et votre téléphone sont écrits sur chaque facture et chaque soumission, pour que vos clients sachent qui appeler.",
    render: ({ onDone }) => <GuidedCompanyContact onDone={onDone} />,
    selfAdvancing: true,
  },
  {
    key: "entreprise-logo",
    group: "Votre entreprise",
    title: "Logo",
    question: "Avez-vous un logo ?",
    explain: "Votre logo est imprimé sur vos factures et vos soumissions. Une image PNG ou JPEG de moins de 2 Mo fait l'affaire.",
    ask: { yes: "Oui, je l'ajoute", no: "Pas pour l'instant", noNote: "Votre nom sera écrit à la place. Vous pourrez l'ajouter plus tard." },
    render: () => <WithProfile>{(profile) => <LogoCard profile={profile} />}</WithProfile>,
  },
  {
    key: "entreprise-couleur",
    group: "Votre entreprise",
    title: "Couleur",
    question: "Votre entreprise a-t-elle une couleur ?",
    explain: "Si votre entreprise a une couleur (celle de votre logo, de vos camions…), Vexta l'utilise sur vos documents et votre page.",
    ask: { yes: "Oui, je la choisis", no: "Non, garder le bleu", noNote: "Vexta garde son bleu. Vous pourrez changer plus tard." },
    render: () => <WithProfile>{(profile) => <BrandColorCard profile={profile} />}</WithProfile>,
  },
  {
    key: "entreprise-lieux",
    group: "Votre entreprise",
    title: "Adresses",
    question: "Où se trouve votre entreprise ?",
    explain:
      "L'adresse principale est imprimée sur vos documents. Ajoutez aussi vos autres lieux (entrepôt, atelier, deuxième bureau) si vous en avez : vos employés pourront s'y rattacher.",
    render: () => <LocationsSection />,
  },

  // ---- Page publique ----
  {
    key: "page-publique",
    group: "Page publique",
    title: "Avoir une page publique",
    question: "Voulez-vous une page publique ?",
    explain: (
      <>
        <p>
          C&apos;est un petit site web pour votre entreprise, déjà prêt. Les gens y trouvent qui vous êtes, comment vous joindre et,
          si vous le voulez, vos produits, vos offres d&apos;emploi et vos photos.
        </p>
        <p className="mt-2">Elle est gratuite et incluse. Vous n&apos;avez pas besoin de savoir faire un site.</p>
      </>
    ),
    ask: { yes: "Oui, je veux une page", no: "Non merci", noNote: "Aucune page ne sera visible. Vous pourrez en créer une plus tard dans Paramètres." },
  },
  {
    key: "page-texte",
    group: "Page publique",
    title: "Ce que dit votre page",
    question: "Que voulez-vous dire aux visiteurs ?",
    explain: "Quelques phrases simples suffisent. Imaginez que vous vous présentez à un nouveau client.",
    when: wantsPublicPage,
    render: ({ onDone }) => <GuidedPublicText onDone={onDone} />,
    selfAdvancing: true,
  },
  {
    key: "page-contenu",
    group: "Page publique",
    title: "Ce que montre votre page",
    question: "Que voulez-vous montrer sur votre page ?",
    explain: "Cochez ce que les visiteurs peuvent voir. Tout ce qui n'est pas coché reste privé.",
    when: wantsPublicPage,
    render: ({ onDone }) => <GuidedPublicContent onDone={onDone} />,
    selfAdvancing: true,
  },
  {
    key: "page-style",
    group: "Page publique",
    title: "Apparence",
    question: "Quel style préférez-vous ?",
    explain: "Le contenu reste le même, seule la mise en page change. Tous les styles utilisent votre couleur et votre logo.",
    when: wantsPublicPage,
    render: ({ onDone }) => <GuidedPublicStyle onDone={onDone} />,
    selfAdvancing: true,
  },
  {
    key: "page-galeries",
    group: "Page publique",
    title: "Photos",
    question: "Voulez-vous montrer des photos de vos réalisations ?",
    explain: "Des photos de vos travaux donnent confiance. Créez une galerie, puis ajoutez-y vos images.",
    when: wantsPublicPage,
    ask: { yes: "Oui, j'ajoute des photos", no: "Pas maintenant" },
    render: () => <GalleriesSection canEdit />,
  },
  {
    key: "page-publier",
    group: "Page publique",
    title: "Mettre en ligne",
    question: "Votre page est prête à être vue ?",
    explain: "Ouvrez-la pour voir ce que vos visiteurs verront. Mettez-la en ligne quand elle vous plaît.",
    when: wantsPublicPage,
    render: ({ onDone }) => <GuidedPublish onDone={onDone} />,
    selfAdvancing: true,
  },

  // ---- Facturation ----
  {
    key: "facturation-taxes",
    group: "Facturation",
    title: "Taxes et numéros",
    question: "Quelles taxes chargez-vous ?",
    explain:
      "Vexta a besoin de vos numéros de TPS et de TVQ (si vous en avez) et de la façon de numéroter vos factures. C'est obligatoire avant d'envoyer votre première facture.",
    render: () => <BillingSettingsCard />,
  },
  {
    key: "facturation-relances",
    group: "Facturation",
    title: "Relances de paiement",
    question: "Voulez-vous que Vexta rappelle les clients qui n'ont pas payé ?",
    explain: "Quand une facture est en retard, Vexta peut envoyer un courriel de rappel poli à votre place.",
    ask: { yes: "Oui, rappeler pour moi", no: "Non, je m'en occupe", noNote: "Aucun rappel ne sera envoyé automatiquement." },
    render: () => <InvoiceReminderCard />,
  },
  {
    key: "facturation-frais",
    group: "Facturation",
    title: "Frais automatiques",
    question: "Ajoutez-vous des frais sur toutes vos factures ?",
    explain: "Par exemple des frais d'administration ou de déplacement. Vexta peut les ajouter tout seul sur chaque facture.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <InvoiceAutoFeesCard />,
  },

  // ---- Soumissions ----
  {
    key: "soumissions-conditions",
    group: "Soumissions",
    title: "Conditions",
    question: "Voulez-vous écrire vos conditions sur vos soumissions ?",
    explain: "Par exemple le dépôt demandé, les délais ou la garantie. Elles sont imprimées au-dessus de la signature du client.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <QuoteTermsCard />,
  },
  {
    key: "soumissions-relances",
    group: "Soumissions",
    title: "Relances",
    question: "Voulez-vous relancer les clients qui ne répondent pas à une soumission ?",
    explain: "Si un client ne répond pas après quelques jours, Vexta peut lui renvoyer la soumission avec un petit rappel.",
    ask: { yes: "Oui", no: "Non", noNote: "Aucune relance ne sera envoyée automatiquement." },
    render: () => <QuoteReminderCard />,
  },
  {
    key: "soumissions-reponses",
    group: "Soumissions",
    title: "Réponses du client",
    question: "Que peuvent répondre vos clients depuis le courriel ?",
    explain: "Vos clients peuvent accepter une soumission, demander un changement ou la refuser en un clic. Choisissez ce que vous leur permettez.",
    render: () => <QuoteResponsesCard />,
  },

  // ---- Courriels ----
  {
    key: "courriels",
    group: "Courriels",
    title: "Vos messages",
    question: "Voulez-vous écrire vos propres messages d'envoi ?",
    explain: "Quand vous envoyez une facture ou une soumission, un court message l'accompagne. Vexta en a un déjà prêt.",
    ask: { yes: "Oui, je les écris", no: "Non, celui de Vexta me va", noNote: "Vexta utilisera son message déjà prêt." },
    render: () => (
      <div className="space-y-4">
        <EmailTemplateCard kind="facture" />
        <EmailTemplateCard kind="soumission" />
      </div>
    ),
  },

  // ---- Paiements ----
  {
    key: "paiements-carte",
    group: "Paiements",
    title: "Carte de crédit",
    question: "Voulez-vous être payé par carte de crédit ?",
    explain: "Vos clients paient leur facture en ligne avec leur carte. L'argent arrive dans votre compte par Stripe, un service de paiement sécurisé.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <OnlinePaymentsCard />,
  },
  {
    key: "paiements-paypal",
    group: "Paiements",
    title: "PayPal",
    question: "Voulez-vous être payé par PayPal ?",
    explain: "Certains clients préfèrent payer avec leur compte PayPal.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <PayPalCard />,
  },

  // ---- Taux et prix ----
  {
    key: "taux-horaire",
    group: "Taux et prix",
    title: "Taux horaire",
    question: "Combien chargez-vous de l'heure ?",
    explain: "Ce montant est proposé chaque fois que vous facturez des heures de travail. Vous pourrez toujours le changer sur une facture.",
    render: () => <HourlyRateCard />,
  },
  {
    key: "taux-classements",
    group: "Taux et prix",
    title: "Classements",
    question: "Payez-vous vos employés selon leur classement ?",
    explain: "Par exemple apprenti, compagnon ou contremaître, chacun avec son salaire et le prix que vous chargez. Vous choisissez le classement sur le projet.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <WageClassificationsCard />,
  },
  {
    key: "marge-mode",
    group: "Taux et prix",
    title: "Calcul de la marge",
    question: "Comment calculez-vous votre marge ?",
    explain: "Votre marge, c'est ce que vous gagnez sur ce que vous vendez. Choisissez la façon que vous utilisez déjà ; les exemples vous aident.",
    render: () => <MarginModeCard />,
  },
  {
    key: "marge-politiques",
    group: "Taux et prix",
    title: "Politiques de prix",
    question: "Avez-vous des règles pour fixer vos prix ?",
    explain: "Par exemple « Client régulier » avec une marge de 25 %. Vous la choisissez sur un projet ou une facture, et Vexta calcule les prix de vente.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <PricePoliciesCard />,
  },

  // ---- Outils ----
  {
    key: "assistant-ia",
    group: "Outils",
    title: "Assistant IA",
    question: "Voulez-vous utiliser l'assistant IA ?",
    explain: "Branchez votre compte Claude ou ChatGPT : un assistant peut alors faire des tâches dans Vexta à votre place, comme préparer une soumission.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <AiAssistantCard />,
  },
  {
    key: "integrations",
    group: "Outils",
    title: "Autres logiciels",
    question: "Voulez-vous relier Vexta à d'autres logiciels ?",
    explain: "Pour les utilisateurs avancés : une clé permet à un agent IA ou à une automatisation de travailler dans Vexta. Si vous ne savez pas ce que c'est, répondez non.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <McpKeysCard />,
  },
  {
    key: "menu",
    group: "Outils",
    title: "Menu",
    question: "Voulez-vous cacher des onglets que votre entreprise n'utilise pas ?",
    explain: "Décochez les onglets et les sous-onglets dont vous n'avez pas besoin : ils disparaissent du menu pour tout le monde, ce qui le rend plus simple. Vous pourrez les remettre en tout temps dans Paramètres, section Menu.",
    ask: { yes: "Oui", no: "Non" },
    render: () => <MenuVisibilityCard />,
  },
];

/** The steps that apply given the answers so far. */
export function visibleSteps(answers: Record<string, GuideAnswer>) {
  return guideSteps.filter((step) => !step.when || step.when(answers));
}
