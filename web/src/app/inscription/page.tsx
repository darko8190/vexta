"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { PASSWORD_HINT, passwordSchema } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { CompanyAddressFields } from "@/components/addresses/company-address-fields";
import { safeReturnPath } from "@/lib/api";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
import { defaultCountryName } from "@/lib/geo";
import { checkCompanyAddress, companyProfileFrom, emptyCompanyAddress } from "@/lib/company-signup";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";

const formSchema = z
  .object({
    accountType: z.enum(["business", "personal"]),
    companyName: z.string(),
    planId: z.string(),
    firstName: z.string().min(1, "Prénom requis."),
    lastName: z.string().min(1, "Nom requis."),
    email: z.string().min(1, "Le courriel est requis.").email("Courriel invalide."),
    password: passwordSchema,
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    country: z.string(),
    businessNumber: z.string(),
  })
  // A travailleur autonome has no company name to give; their space is named after them.
  .refine((values) => values.accountType === "personal" || values.companyName.trim().length >= 2, {
    message: "Nom d'entreprise requis.",
    path: ["companyName"],
  })
  .refine((values) => values.accountType === "personal" || values.planId.length > 0, {
    message: "Choisissez un forfait.",
    path: ["planId"],
  })
  .superRefine(checkCompanyAddress);

type FormValues = z.infer<typeof formSchema>;

/** Both kinds get the same isolated space — only what it is named differs. */
function spaceNameFor(values: FormValues) {
  return values.accountType === "personal"
    ? `${values.firstName.trim()} ${values.lastName.trim()}`.trim()
    : values.companyName.trim();
}

/**
 * The plan can arrive in the URL from the pricing section. Read in its own component so the
 * Suspense boundary Next requires around useSearchParams does not wrap the whole form, and so
 * the value reaches the form as a default rather than through an effect.
 */
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageWithParams />
    </Suspense>
  );
}

function RegisterPageWithParams() {
  const params = useSearchParams();
  const initialPlanId = params.get("forfait") ?? "";
  // Opened on the personal tab when somebody arrived from a job posting: they are not here to
  // buy a business plan, and landing on that tab reads as the wrong door.
  const initialKind = params.get("type") === "personnel" ? "personal" : "business";
  const retour = safeReturnPath(params.get("retour"));

  return <RegisterForm initialPlanId={initialPlanId} initialKind={initialKind} retour={retour} />;
}

function RegisterForm({
  initialPlanId,
  initialKind,
  retour,
}: {
  initialPlanId: string;
  initialKind: "business" | "personal";
  retour: string | null;
}) {
  const { registerTenant } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: plans, isLoading: plansLoading } = usePublicPlansQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountType: initialKind,
      companyName: "",
      planId: initialPlanId,
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      ...emptyCompanyAddress(defaultCountryName),
    },
  });

  // useWatch, not form.watch: the latter returns a fresh function each render, which opts the
  // whole component out of React Compiler memoisation.
  const accountType = useWatch({ control: form.control, name: "accountType" });
  const isPersonal = accountType === "personal";

  // Which plan is selected decides what happens when the button is pressed, so it decides what
  // the button says. Promising a payment page to somebody starting a free trial is a small lie
  // that costs a signup: the people most likely to abandon here are the ones who were told to
  // get their card out.
  const planId = useWatch({ control: form.control, name: "planId" });
  const chosenPlan = plans?.find((plan) => plan.id === planId);
  const freeTrial = !isPersonal && (chosenPlan?.trialDays ?? 0) > 0;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await registerTenant({
        companyName: spaceNameFor(values),
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        kind: values.accountType === "personal" ? "Personal" : "Business",
        planId: values.accountType === "personal" ? null : values.planId,
        profile: companyProfileFrom(values, values.accountType === "personal"),
      });

      // Free spaces skip Stripe entirely and land straight in the app.
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
      } else {
        router.push(retour ?? "/tableau-de-bord");
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="vx-rise mb-8 flex flex-col items-center gap-2">
        <Link href="/" aria-label="Vexta — accueil" className="transition-opacity hover:opacity-70">
          <VextaLogo className="w-44" priority />
        </Link>
      </div>

      <div className="vx-rise vx-rise-late w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-card-foreground">Créer votre espace Vexta</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {isPersonal
            ? "Gratuit pour les travailleurs autonomes — aucune carte demandée."
            : freeTrial
              ? `${chosenPlan!.trialDays} jours d'essai gratuit — aucune carte demandée maintenant.`
              : "Abonnement mensuel — paiement sécurisé par Stripe à l'étape suivante."}
        </p>

        <Controller
          name="accountType"
          control={form.control}
          render={({ field }) => (
            <Tabs
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
              className="mt-6"
            >
              <TabsList className="w-full">
                <TabsTrigger value="business" className="flex-1">
                  Entreprise
                </TabsTrigger>
                <TabsTrigger value="personal" className="flex-1">
                  Personnel
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        />

        <div className="mt-6">
          <SocialButtons action="signup" />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {!isPersonal && (
              <Controller
                name="companyName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="reg-company">Nom de l&apos;entreprise</FieldLabel>
                    <Input {...field} id="reg-company" placeholder={ex("Acme inc.")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {!isPersonal && <CompanyAddressFields form={form} idPrefix="reg" />}

            {!isPersonal && (
              <Controller
                name="planId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Forfait</FieldLabel>

                    {plansLoading ? (
                      <FieldDescription>Chargement des forfaits…</FieldDescription>
                    ) : !plans || plans.length === 0 ? (
                      <FieldDescription>
                        Aucun forfait n&apos;est offert pour le moment. Créez un espace personnel
                        gratuit, ou écrivez-nous.
                      </FieldDescription>
                    ) : (
                      <div role="radiogroup" aria-label="Forfait" className="space-y-2">
                        {plans.map((plan) => {
                          const selected = field.value === plan.id;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => field.onChange(plan.id)}
                              className={cn(
                                "flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                                "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted/40",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">{plan.name}</span>
                                {plan.description && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {plan.description}
                                  </span>
                                )}
                                {/* Said where the choice is made. A trial the buyer is not told
                                    about is a trial nobody takes, and "sans carte de crédit" is
                                    the part that decides it. */}
                                {plan.trialDays > 0 && (
                                  <span className="mt-0.5 block text-xs font-medium text-primary">
                                    {plan.trialDays} jours gratuits, sans carte de crédit
                                  </span>
                                )}
                                {plan.discountPercent > 0 && plan.discountMonths > 0 && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    Puis {plan.discountPercent} % de rabais pendant{" "}
                                    {plan.discountMonths === 1
                                      ? "le premier mois"
                                      : `les ${plan.discountMonths} premiers mois`}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums text-foreground">
                                {formatCents(plan.amountCents, plan.currency)}
                                <span className="text-muted-foreground"> /mois</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="firstName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="reg-firstname">Prénom</FieldLabel>
                    <Input {...field} id="reg-firstname" autoComplete="given-name" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="lastName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="reg-lastname">Nom</FieldLabel>
                    <Input {...field} id="reg-lastname" autoComplete="family-name" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            {isPersonal && (
              <FieldDescription>
                Votre espace portera votre nom, et il est gratuit — mêmes fonctions que
                l&apos;offre entreprise, sans abonnement.
              </FieldDescription>
            )}

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reg-email">Courriel</FieldLabel>
                  <Input
                    {...field}
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder={ex("vous@entreprise.com")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reg-password">Mot de passe</FieldLabel>
                  <PasswordInput
                    {...field}
                    id="reg-password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>{PASSWORD_HINT}</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {serverError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              {isPersonal || freeTrial ? "Créer mon espace" : "Continuer vers le paiement"}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/connexion" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
