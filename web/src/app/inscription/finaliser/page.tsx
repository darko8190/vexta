"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VextaLogo } from "@/components/brand/vexta-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { CompanyAddressFields } from "@/components/addresses/company-address-fields";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
import { checkCompanyAddress, companyProfileFrom, emptyCompanyAddress } from "@/lib/company-signup";
import { defaultCountryName } from "@/lib/geo";
import { PlanPicker } from "@/components/auth/plan-picker";
import { cn } from "@/lib/utils";
import { ex } from "@/lib/placeholders";

const formSchema = z
  .object({
    accountType: z.enum(["business", "personal"]),
    companyName: z.string(),
    planId: z.string(),
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    country: z.string(),
    businessNumber: z.string(),
  })
  // A travailleur autonome has no company name to give; their space is named after them.
  .refine((values) => values.accountType === "personal" || values.planId.length > 0, {
    message: "Choisissez un forfait.",
    path: ["planId"],
  })
  .refine((values) => values.accountType === "personal" || values.companyName.trim().length >= 2, {
    message: "Le nom de l'entreprise est requis.",
    path: ["companyName"],
  })
  .superRefine(checkCompanyAddress);

type FormValues = z.infer<typeof formSchema>;

interface PendingSignup {
  email: string;
  firstName: string;
  lastName: string;
  provider: string;
}

function CompanyStep() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const ticket = params.get("ticket");

  const [pending, setPending] = useState<PendingSignup | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Derived, not stored: a missing ticket is a fact about the URL, not something that happens.
  const loadError = fetchError ?? (ticket ? null : "Lien d'inscription incomplet.");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountType: "business",
      companyName: "",
      planId: "",
      ...emptyCompanyAddress(defaultCountryName),
    },
  });

  const accountType = useWatch({ control: form.control, name: "accountType" });
  const isPersonal = accountType === "personal";
  const { data: plans, isLoading: plansLoading } = usePublicPlansQuery();

  // A business picks its plan on a second step, where each plan has room for its details.
  const [step, setStep] = useState<"details" | "plan">("details");
  const choosingPlan = step === "plan" && !isPersonal;
  const planId = useWatch({ control: form.control, name: "planId" });
  const freeTrial = !isPersonal && (plans?.find((plan) => plan.id === planId)?.trialDays ?? 0) > 0;

  async function goToPlans() {
    const valid = await form.trigger([
      "companyName",
      "line1",
      "line2",
      "city",
      "province",
      "postalCode",
      "country",
      "businessNumber",
    ]);
    if (valid) {
      setServerError(null);
      setStep("plan");
      window.scrollTo({ top: 0 });
    }
  }

  useEffect(() => {
    if (!ticket) return;

    let cancelled = false;
    fetch(`/api/auth/external/ticket?ticket=${encodeURIComponent(ticket)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message ?? "Inscription expirée.");
        return data as PendingSignup;
      })
      .then((data) => {
        if (!cancelled) setPending(data);
      })
      .catch((caught) => {
        if (!cancelled) {
          setFetchError(caught instanceof Error ? caught.message : "Inscription expirée.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ticket]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const response = await fetch("/api/auth/external/register-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A blank company name tells the API this is personal; it names the space after the
        // person, using the names held in the ticket rather than anything the browser supplies.
        body: JSON.stringify({
          ticket,
          companyName: values.accountType === "personal" ? null : values.companyName,
          planId: values.accountType === "personal" ? null : values.planId,
          profile: companyProfileFrom(values, values.accountType === "personal"),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? "Erreur lors de l'inscription.");

      // Free spaces skip Stripe entirely: the cookie is already set, so go straight in.
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        await refresh();
        router.push("/tableau-de-bord");
      }
    } catch (caught) {
      setServerError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    }
  }

  if (loadError) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground">Inscription expirée</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <Link href="/inscription" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Recommencer l&apos;inscription
        </Link>
      </div>
    );
  }

  if (!pending) {
    return <Spinner className="size-6" />;
  }

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-border bg-card p-8 shadow-sm",
        choosingPlan ? "max-w-4xl" : "max-w-md",
      )}
    >
      <h1 className="text-center text-xl font-semibold text-card-foreground">
        {choosingPlan ? "Choisissez votre forfait" : "Encore une chose"}
      </h1>
      {!choosingPlan && (
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {pending.provider} nous a confirmé <span className="font-medium text-foreground">{pending.email}</span>.
          Il ne reste qu&apos;à nommer votre espace.
        </p>
      )}

      {!choosingPlan && (
      <Controller
        name="accountType"
        control={form.control}
        render={({ field }) => (
          <Tabs value={field.value} onValueChange={(value) => field.onChange(value)} className="mt-6">
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
      )}

      <form
        className="mt-6"
        // Enter on the first step of a business signup goes on to the plans, not to the API.
        onSubmit={(event) => {
          if (!isPersonal && step === "details") {
            event.preventDefault();
            void goToPlans();
            return;
          }
          void form.handleSubmit(onSubmit)(event);
        }}
        noValidate
      >
        {choosingPlan ? (
          <FieldGroup>
            <Controller
              name="planId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  {plansLoading ? (
                    <FieldDescription>Chargement des forfaits…</FieldDescription>
                  ) : !plans || plans.length === 0 ? (
                    <FieldDescription>
                      Aucun forfait n&apos;est offert pour le moment. Créez un espace personnel gratuit.
                    </FieldDescription>
                  ) : (
                    <PlanPicker plans={plans} value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {serverError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("details")}>
                Retour
              </Button>
              <Button type="submit" className="sm:min-w-56" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Spinner />}
                {freeTrial ? "Créer mon espace" : "Continuer vers le paiement"}
              </Button>
            </div>
          </FieldGroup>
        ) : (
        <FieldGroup>
          {!isPersonal && (
            <Controller
              name="companyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="company-name">Nom de l&apos;entreprise</FieldLabel>
                  <Input
                    {...field}
                    id="company-name"
                    autoFocus
                    placeholder={ex("Acme inc.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          )}

          {!isPersonal && <CompanyAddressFields form={form} idPrefix="fin" />}

          {serverError && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {serverError}
            </p>
          )}

          {isPersonal ? (
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Créer mon espace
            </Button>
          ) : (
            <Button type="button" className="w-full" onClick={() => void goToPlans()}>
              Continuer
            </Button>
          )}
        </FieldGroup>
        )}
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {isPersonal
          ? "Gratuit pour les travailleurs autonomes."
          : "Abonnement mensuel — paiement sécurisé par Stripe."}
      </p>
    </div>
  );
}

export default function ExternalSignupCompanyPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-8">
        <VextaLogo className="w-44" priority />
      </div>

      <Suspense fallback={<Spinner className="size-6" />}>
        <CompanyStep />
      </Suspense>
    </div>
  );
}
