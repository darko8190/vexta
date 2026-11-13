import Link from "next/link";
import {
  Check,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

// Prix affiché aux visiteurs : doit correspondre au prix Stripe configuré dans Intégrations.
const PRIX_MENSUEL = "49 $";

const features = [
  {
    icon: Users,
    title: "Clients",
    description: "Une fiche par client, avec ses coordonnées et son historique, trouvable en une recherche.",
  },
  {
    icon: MapPin,
    title: "Adresses",
    description: "Autant d'adresses que nécessaire par client : facturation, livraison, siège social ou autre.",
  },
  {
    icon: FolderKanban,
    title: "Projets",
    description: "Suivez chaque mandat de planifié à terminé, rattaché au bon client et à la bonne adresse.",
  },
  {
    icon: FileText,
    title: "Factures",
    description: "Du brouillon au paiement, avec les retards bien visibles au lieu d'être enfouis dans un chiffrier.",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord",
    description: "L'état de vos clients, projets et factures en un coup d'œil dès l'ouverture de session.",
  },
  {
    icon: ShieldCheck,
    title: "Espace cloisonné",
    description: "Chaque entreprise a son propre espace. Vos données ne croisent jamais celles d'une autre.",
  },
];

const included = [
  "Clients et adresses illimités",
  "Projets et factures illimités",
  "Tableau de bord et recherche",
  "Mises à jour incluses",
];

const faq = [
  {
    question: "Qu'est-ce qu'il faut pour commencer ?",
    answer:
      "Le nom de votre entreprise et un courriel. Vexta fonctionne dans le navigateur : rien à installer, rien à configurer sur vos postes.",
  },
  {
    question: "Comment se passe le paiement ?",
    answer:
      "L'abonnement est mensuel et le paiement est traité par Stripe. Vos informations de carte ne transitent jamais par Vexta.",
  },
  {
    question: "Mes données sont-elles séparées de celles des autres entreprises ?",
    answer:
      "Oui. Chaque entreprise dispose de son espace cloisonné, et seuls les comptes de votre entreprise y ont accès.",
  },
  {
    question: "Puis-je gérer plusieurs adresses pour un même client ?",
    answer:
      "Oui. Un client peut avoir une adresse de facturation, une de livraison, un siège social et autant d'autres adresses que nécessaire.",
  },
];

const previewRows = [
  { numero: "FAC-00128", client: "Constructions Rivard", montant: "4 250,00 $", statut: "Payée", variant: "default" as const },
  { numero: "FAC-00127", client: "Atelier Belmont", montant: "1 880,00 $", statut: "Envoyée", variant: "secondary" as const },
  { numero: "FAC-00126", client: "Groupe Lanteigne", montant: "960,00 $", statut: "En retard", variant: "destructive" as const },
  { numero: "FAC-00125", client: "Plomberie Caron", montant: "2 140,00 $", statut: "Brouillon", variant: "outline" as const },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 md:pt-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Vos clients, vos projets et vos factures au même endroit.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Vexta réunit la gestion des clients, des adresses, des projets et de la facturation dans
              une seule plateforme claire, pensée pour les petites entreprises de services.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/inscription" className={cn(buttonVariants(), "h-11 px-6")}>
                Créer votre espace
              </Link>
              <Link
                href="/connexion"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 px-6")}
              >
                Se connecter
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Abonnement mensuel · Paiement sécurisé par Stripe
            </p>
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-2 shadow-sm">
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-foreground">Factures</p>
                <p className="text-xs text-muted-foreground">4 sur 128</p>
              </div>
              <ul>
                {previewRows.map((row) => (
                  <li
                    key={row.numero}
                    className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{row.numero}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.client}</span>
                    <span className="hidden text-sm tabular-nums text-foreground sm:block">{row.montant}</span>
                    <Badge variant={row.variant} className="w-20 shrink-0">
                      {row.statut}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="border-t border-border bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tout ce qu&apos;il faut pour suivre un mandat, de la première adresse à la facture payée.
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Pas de modules à acheter séparément : les six font partie du même abonnement.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-xl border border-border bg-card p-6"
                  >
                    <Icon className="size-5 text-primary" />
                    <h3 className="mt-4 text-base font-medium text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="tarif" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Un seul forfait, tout inclus.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Pas de paliers, pas de surprise à la fin du mois.
              </p>
            </div>

            <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-8">
              <p className="text-sm font-medium text-muted-foreground">Abonnement Vexta</p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-foreground">{PRIX_MENSUEL}</span>
                <span className="text-sm text-muted-foreground">par mois, par entreprise</span>
              </p>

              <ul className="mt-8 space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/inscription"
                className={cn(buttonVariants(), "mt-8 h-11 w-full px-6")}
              >
                Créer votre espace
              </Link>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Paiement sécurisé par Stripe à l&apos;étape suivante.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-border bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Questions fréquentes
            </h2>

            <dl className="mt-12 grid gap-10 md:grid-cols-2">
              {faq.map((item) => (
                <div key={item.question}>
                  <dt className="text-base font-medium text-foreground">{item.question}</dt>
                  <dd className="mt-2 text-sm text-muted-foreground">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Prêt à mettre de l&apos;ordre dans votre facturation ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Créez votre espace en quelques minutes et retrouvez vos clients, vos projets et vos
              factures au même endroit.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/inscription" className={cn(buttonVariants(), "h-11 px-6")}>
                Créer votre espace
              </Link>
              <Link
                href="/connexion"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 px-6")}
              >
                Se connecter
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
