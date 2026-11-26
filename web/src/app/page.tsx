import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PlanCards, PlanOffers } from "@/components/marketing/plan-cards";
import { PlanComparison } from "@/components/marketing/plan-comparison";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { SiteHeader } from "@/components/marketing/site-header";
import { getPublishedModules, getPublishedPlans } from "@/lib/catalog-cache";
import { moduleIcon } from "@/lib/module-icons";
import type { PublicModule, PublicPlan } from "@/lib/types";

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

/**
 * Reads the catalogue at request time.
 *
 * connection() keeps this out of the prerender; the "use cache" functions behind it still make
 * a request cheap. A failure is caught here, outside the cache, so an API that is restarting
 * during a deploy costs one visitor an empty section rather than freezing it for everyone.
 */
async function readCatalog() {
  await connection();

  const [modules, plans] = await Promise.all([
    getPublishedModules().catch(() => [] as PublicModule[]),
    getPublishedPlans().catch(() => [] as PublicPlan[]),
  ]);

  return { modules, plans };
}

async function ModulesSection() {
  const { modules } = await readCatalog();

  if (modules.length === 0) return null;

  return (
    <section id="fonctionnalites" className="border-t border-border bg-card/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="vx-reveal text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Tout ce qu&apos;il faut pour suivre un mandat, de la première adresse à la facture payée.
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => {
            const Icon = moduleIcon(module.icon);
            return (
              <div key={module.id} className="vx-reveal vx-lift rounded-xl border border-border bg-card p-6">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-4 text-base font-medium text-foreground">{module.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{module.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

async function PricingSection() {
  const { modules, plans } = await readCatalog();

  return (
    <section id="tarif" className="vx-glow vx-glow-mirrored border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="vx-reveal mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {plans.length > 1 ? "Choisissez votre forfait." : "Un forfait, tout inclus."}
          </h2>
          <p className="mt-4 text-muted-foreground">
            Pas de surprise à la fin du mois. Paiement sécurisé par Stripe.
          </p>
        </div>
        <PlanOffers plans={plans} />

        {plans.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-2xl font-semibold tracking-tight text-foreground">Sur demande</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Écrivez-nous pour connaître les tarifs en vigueur.
            </p>
          </div>
        ) : (
          <>
            <PlanCards plans={plans} />
            <PlanComparison plans={plans} catalogue={modules} />
          </>
        )}
      </div>
    </section>
  );
}

/** Holds the section's place while the catalogue loads, so the FAQ does not jump up and back. */
function PricingFallback() {
  return (
    <section id="tarif" className="vx-glow vx-glow-mirrored border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="min-h-96" />
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <ScrollReveal />

      <main className="flex-1">
        <section className="vx-glow">
          <div className="vx-intro mx-auto w-full max-w-6xl px-4 pt-20 pb-24 text-center sm:px-6 md:pt-28">
            {/* sm:block puts the accent on its own line, one sentence per line as on the
                reference; below sm it flows inline so a phone does not get a lonely short line. */}
            <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              Vos projets. Votre travail.{" "}
              <span className="vx-hero-accent sm:block">Votre croissance.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              Une vue claire sur vos clients, vos projets et votre facturation, dans un espace de
              travail propre à votre entreprise.
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
            <p className="mt-4 text-sm text-muted-foreground">
              Abonnement mensuel · Paiement sécurisé par Stripe
            </p>
          </div>

        </section>

        {/* The catalogue is read per request, never baked into the build. The image is built
            with no API running, and a prerendered empty catalogue survived every redeploy until
            someone saved a plan and purged it. The rest of the page stays static. */}
        <Suspense fallback={null}>
          <ModulesSection />
        </Suspense>

        <Suspense fallback={<PricingFallback />}>
          <PricingSection />
        </Suspense>

        <section id="faq" className="border-t border-border bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="vx-reveal text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Questions fréquentes
            </h2>

            <dl className="mt-12 grid gap-10 md:grid-cols-2">
              {faq.map((item) => (
                <div key={item.question} className="vx-reveal">
                  <dt className="text-base font-medium text-foreground">{item.question}</dt>
                  <dd className="mt-2 text-sm text-muted-foreground">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="vx-glow vx-glow-band border-t border-border">
          <div className="vx-reveal mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
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
