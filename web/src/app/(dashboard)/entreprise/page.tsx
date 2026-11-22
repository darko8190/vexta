"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Building2, MapPin, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import {
  useCompanyProfileQuery,
  useDeleteCompanyLogo,
  useSaveCompanyProfile,
  useUploadCompanyLogo,
} from "@/hooks/use-company";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { CompanyProfile } from "@/lib/types";

const MAX_BYTES = 2 * 1024 * 1024;

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(2000, "2000 caractères maximum."),
  contactEmail: z
    .string()
    .trim()
    .max(256)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Courriel invalide."),
  phone: z.string().trim().max(40, "40 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(profile?: CompanyProfile): FormValues {
  return {
    name: profile?.name ?? "",
    description: profile?.description ?? "",
    contactEmail: profile?.contactEmail ?? "",
    phone: profile?.phone ?? "",
  };
}

function LogoCard({ profile }: { profile: CompanyProfile }) {
  const upload = useUploadCompanyLogo();
  const remove = useDeleteCompanyLogo();
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = upload.isPending || remove.isPending;

  async function onPick(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("Le logo ne peut pas dépasser 2 Mo.");
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Logo mis à jour.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce logo.");
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      toast.success("Logo retiré.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer ce logo.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4" />
          Logo
        </CardTitle>
        <CardDescription>PNG, JPEG, WebP ou SVG, 2 Mo au maximum.</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
            {profile.logoETag ? (
              /* Not next/image: the bytes come from our own API with an ETag that already busts
                 the cache, and the optimizer would add a round trip for nothing. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/company/${profile.id}/logo?v=${profile.logoETag}`}
                alt={`Logo de ${profile.name}`}
                className="size-full object-contain p-1"
              />
            ) : (
              <Building2 className="size-8 text-muted-foreground" />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPick(file);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
              {upload.isPending ? <Spinner /> : <Upload />}
              {profile.logoETag ? "Remplacer" : "Téléverser"}
            </Button>
            {profile.logoETag && (
              <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>
                <Trash2 />
                Retirer
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddressCard({ profile }: { profile: CompanyProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" />
          Adresse
        </CardTitle>
        <CardDescription>
          L&apos;adresse principale de l&apos;entreprise, telle qu&apos;elle apparaît sur vos documents.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {profile.address ? (
          <div className="text-sm">
            <p className="font-medium text-foreground">{profile.address.label}</p>
            <p className="mt-1 text-muted-foreground">
              {[
                profile.address.line1,
                profile.address.line2,
                profile.address.city,
                profile.address.province,
                profile.address.postalCode,
                profile.address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune adresse principale.</p>
        )}
      </CardContent>

      <CardFooter>
        {/* A styled link, not a Button rendering one: Base UI drops native button semantics
            when its render target is not a <button>, and this is a navigation. */}
        <Link href="/ressources-humaines" className={cn(buttonVariants({ variant: "outline" }))}>
          {profile.address ? "Gérer les adresses" : "Ajouter une adresse"}
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function CompanyPage() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useCompanyProfileQuery();
  const save = useSaveCompanyProfile();

  const canEdit = user?.role === "TenantAdmin" || user?.role === "SuperAdmin";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(profile),
  });

  useEffect(() => {
    if (profile) form.reset(toFormValues(profile));
  }, [profile, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        name: values.name,
        description: values.description || null,
        contactEmail: values.contactEmail || null,
        phone: values.phone || null,
      });
      toast.success("Fiche mise à jour.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer la fiche.");
    }
  }

  if (isLoading || !profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Fiche entreprise"
        description="Ce que vos clients voient de vous, et ce qui apparaît sur vos documents."
      />

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Identité</CardTitle>
            <CardDescription>
              {canEdit
                ? "Le nom sert partout dans l'application."
                : "Seul le propriétaire de l'entreprise peut modifier ces informations."}
            </CardDescription>
          </CardHeader>

          <form id="company-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <CardContent>
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="company-name">Nom</FieldLabel>
                      <Input {...field} id="company-name" disabled={!canEdit} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                <Controller
                  name="description"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="company-description">Description</FieldLabel>
                      <Textarea
                        {...field}
                        id="company-description"
                        rows={4}
                        disabled={!canEdit}
                        placeholder="Entrepreneur général en rénovation résidentielle depuis 2008."
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    name="contactEmail"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="company-email">Courriel</FieldLabel>
                        <Input
                          {...field}
                          id="company-email"
                          type="email"
                          disabled={!canEdit}
                          placeholder="info@entreprise.ca"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : (
                          <FieldDescription>Celui que vos clients utilisent.</FieldDescription>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="company-phone">Téléphone</FieldLabel>
                        <Input
                          {...field}
                          id="company-phone"
                          type="tel"
                          disabled={!canEdit}
                          placeholder="418 555-0100"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                </div>
              </FieldGroup>
            </CardContent>

            {canEdit && (
              <CardFooter>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Spinner />}
                  Enregistrer
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>

        {canEdit && <LogoCard profile={profile} />}
        <AddressCard profile={profile} />
      </div>
    </div>
  );
}
