"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { BadgeCheck, GraduationCap, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect, SubdivisionField } from "@/components/addresses/country-field";
import { AnswerFileInput } from "@/components/forms/answer-file-input";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { usePersonalProfileQuery, useSavePersonalProfile } from "@/hooks/use-personal-profile";
import { ApiError } from "@/lib/api";
import { defaultCountryName, isKnownSubdivision, subdivisionLabel } from "@/lib/geo";
import { ex } from "@/lib/placeholders";
import type { PersonalProfile } from "@/lib/types";

const YEAR = /^(19|20)\d{2}$/;

const formSchema = z.object({
  phone: z.string().trim().max(40, "40 caractères maximum."),
  headline: z.string().trim().max(200, "200 caractères maximum."),
  summary: z.string().trim().max(4000, "4000 caractères maximum."),
  city: z.string().trim().max(100, "100 caractères maximum."),
  province: z.string().trim().max(80, "80 caractères maximum."),
  country: z.string().trim().max(80, "80 caractères maximum."),
  availableFrom: z.string(),
  skills: z.string().trim().max(2000, "2000 caractères maximum."),
  spokenLanguages: z.string().trim().max(500, "500 caractères maximum."),
  writtenLanguages: z.string().trim().max(500, "500 caractères maximum."),
  resumeMediaAssetId: z.string().nullable(),
  resumeFileName: z.string(),
  experiences: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Le poste est requis.").max(200, "200 caractères maximum."),
        employer: z.string().trim().max(200, "200 caractères maximum."),
        location: z.string().trim().max(200, "200 caractères maximum."),
        startedOn: z.string(),
        endedOn: z.string(),
        description: z.string().trim().max(2000, "2000 caractères maximum."),
      }),
    )
    .max(20, "Vingt expériences au maximum."),
  education: z
    .array(
      z.object({
        program: z.string().trim().min(1, "La formation est requise.").max(200, "200 caractères maximum."),
        school: z.string().trim().max(200, "200 caractères maximum."),
        // A string like every other number in this codebase's forms: a coerced number makes the
        // schema's input and output types differ, which the resolver refuses.
        completedYear: z
          .string()
          .trim()
          .refine((value) => value === "" || YEAR.test(value), "Entrez une année à quatre chiffres."),
        notes: z.string().trim().max(1000, "1000 caractères maximum."),
      }),
    )
    .max(10, "Dix formations au maximum."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(profile?: PersonalProfile): FormValues {
  return {
    phone: profile?.phone ?? "",
    headline: profile?.headline ?? "",
    summary: profile?.summary ?? "",
    city: profile?.city ?? "",
    province: profile?.province ?? "",
    country: profile?.country ?? defaultCountryName,
    availableFrom: profile?.availableFrom ?? "",
    skills: profile?.skills ?? "",
    spokenLanguages: profile?.spokenLanguages ?? "",
    writtenLanguages: profile?.writtenLanguages ?? "",
    resumeMediaAssetId: profile?.resumeMediaAssetId ?? null,
    resumeFileName: profile?.resumeFileName ?? "",
    experiences:
      profile?.experiences.map((x) => ({
        title: x.title,
        employer: x.employer ?? "",
        location: x.location ?? "",
        startedOn: x.startedOn ?? "",
        endedOn: x.endedOn ?? "",
        description: x.description ?? "",
      })) ?? [],
    education:
      profile?.education.map((x) => ({
        program: x.program,
        school: x.school ?? "",
        completedYear: x.completedYear ? String(x.completedYear) : "",
        notes: x.notes ?? "",
      })) ?? [],
  };
}

/**
 * Somebody's own CV, written once and sent to every company they answer.
 *
 * The two things that make it enough to apply with — a telephone number, and either one job or
 * an uploaded document — are said at the top as a list of what is missing, because this screen
 * is the gate between the person and a job application. "Incomplete" without saying what is
 * incomplete is the one message nobody can act on.
 */
export function CvSection() {
  const { data: profile, isLoading, isError, error, refetch } = usePersonalProfileQuery();
  const save = useSavePersonalProfile();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(profile),
  });

  useEffect(() => {
    if (profile) form.reset(toFormValues(profile));
  }, [profile, form]);

  const country = useWatch({ control: form.control, name: "country" });
  const resumeId = useWatch({ control: form.control, name: "resumeMediaAssetId" });
  const resumeName = useWatch({ control: form.control, name: "resumeFileName" });

  const experiences = useFieldArray({ control: form.control, name: "experiences" });
  const education = useFieldArray({ control: form.control, name: "education" });

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        phone: values.phone || null,
        headline: values.headline || null,
        summary: values.summary || null,
        city: values.city || null,
        province: values.province || null,
        country: values.country || null,
        availableFrom: values.availableFrom || null,
        skills: values.skills || null,
        spokenLanguages: values.spokenLanguages || null,
        writtenLanguages: values.writtenLanguages || null,
        resumeMediaAssetId: values.resumeMediaAssetId,
        experiences: values.experiences.map((x) => ({
          title: x.title,
          employer: x.employer || null,
          location: x.location || null,
          startedOn: x.startedOn || null,
          endedOn: x.endedOn || null,
          description: x.description || null,
        })),
        education: values.education.map((x) => ({
          program: x.program,
          school: x.school || null,
          completedYear: x.completedYear ? Number(x.completedYear) : null,
          notes: x.notes || null,
        })),
      });
      toast.success("CV enregistré.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'enregistrer votre CV.");
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return <LoadErrorState error={error} onRetry={() => void refetch()} />;
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      {profile && !profile.isComplete && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Il manque {profile.missing.join(" et ")}</AlertTitle>
          <AlertDescription>
            Un employeur doit pouvoir vous joindre et savoir ce que vous avez fait. Dès que ces
            deux éléments sont là, vous pouvez postuler aux offres publiées sur Vexta.
          </AlertDescription>
        </Alert>
      )}

      {profile?.isComplete && (
        <Alert>
          <BadgeCheck />
          <AlertTitle>Votre CV est prêt</AlertTitle>
          <AlertDescription>
            Vous pouvez postuler aux offres publiées sur les pages des entreprises.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vous</CardTitle>
          <CardDescription>
            {profile?.firstName} {profile?.lastName} — {profile?.email}. Le nom et le courriel
            viennent de votre compte.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="cv-phone">
                      Téléphone
                      <RequiredMark />
                    </FieldLabel>
                    <Input {...field} id="cv-phone" type="tel" placeholder={ex("418 555-0100")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>C&apos;est par là qu&apos;on vous rappellera.</FieldDescription>
                    )}
                  </Field>
                )}
              />
              <Controller
                name="availableFrom"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="cv-available">Disponible à partir du</FieldLabel>
                    <Input {...field} id="cv-available" type="date" />
                    <FieldDescription>Laissez vide si vous êtes disponible tout de suite.</FieldDescription>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="headline"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="cv-headline">Titre</FieldLabel>
                  <Input
                    {...field}
                    id="cv-headline"
                    placeholder={ex("Charpentier-menuisier, 12 ans d'expérience")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="summary"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="cv-summary">En quelques mots</FieldLabel>
                  <Textarea {...field} id="cv-summary" rows={4} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Souvent la meilleure chose sur un CV. Écrivez-le dans vos mots.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                name="city"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="cv-city">Ville</FieldLabel>
                    <Input {...field} id="cv-city" placeholder={ex("Lévis")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="country"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="cv-country">Pays</FieldLabel>
                    <CountrySelect
                      id="cv-country"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        if (!isKnownSubdivision(next, form.getValues("province"))) {
                          form.setValue("province", "");
                        }
                      }}
                    />
                  </Field>
                )}
              />
              <Controller
                name="province"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="cv-province">{subdivisionLabel(country)}</FieldLabel>
                    <SubdivisionField
                      id="cv-province"
                      value={field.value}
                      onChange={field.onChange}
                      countryName={country}
                    />
                  </Field>
                )}
              />
            </div>

            <Separator />

            <Field>
              <FieldLabel htmlFor="cv-file">CV en document</FieldLabel>
              <AnswerFileInput
                id="cv-file"
                fileName={resumeId ? resumeName : ""}
                onFile={(asset) => {
                  form.setValue("resumeMediaAssetId", asset?.id ?? null, { shouldDirty: true });
                  form.setValue("resumeFileName", asset?.fileName ?? "", { shouldDirty: true });
                }}
              />
              <FieldDescription>
                Optionnel. Si vous préférez envoyer votre propre document, il remplace la section
                Expérience ci-dessous — l&apos;un ou l&apos;autre suffit pour postuler.
              </FieldDescription>
            </Field>

            <Controller
              name="skills"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="cv-skills">Cartes et compétences</FieldLabel>
                  <Textarea
                    {...field}
                    id="cv-skills"
                    rows={4}
                    placeholder={ex("ASP Construction\nClasse 3\nNacelle")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Une par ligne.</FieldDescription>
                  )}
                </Field>
              )}
            />

            {/* Two lists, not a level per language: "peut parler au client" and "peut écrire
                le rapport" are different questions, and plenty of people answer only one. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="spokenLanguages"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="cv-spoken">Langues parlées</FieldLabel>
                    <Input
                      {...field}
                      id="cv-spoken"
                      placeholder={ex("Français, Anglais")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="writtenLanguages"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="cv-written">Langues écrites</FieldLabel>
                    <Input
                      {...field}
                      id="cv-written"
                      placeholder={ex("Français")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expérience</CardTitle>
          <CardDescription>
            Le plus récent en premier. Laissez la date de fin vide pour l&apos;emploi que vous
            occupez.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {experiences.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune expérience inscrite. Ajoutez-en une, ou téléversez votre CV plus haut.
            </p>
          )}

          {experiences.fields.map((row, index) => (
            <div key={row.id} className="rounded-lg border border-border p-3">
              <FieldGroup>
                <div className="flex items-start gap-3">
                  <Controller
                    name={`experiences.${index}.title`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="flex-1">
                        <FieldLabel htmlFor={`cv-exp-title-${index}`}>
                          Poste
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          {...field}
                          id={`cv-exp-title-${index}`}
                          placeholder={ex("Charpentier")}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    onClick={() => experiences.remove(index)}
                    aria-label={`Retirer l'expérience ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    name={`experiences.${index}.employer`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`cv-exp-employer-${index}`}>Employeur</FieldLabel>
                        <Input {...field} id={`cv-exp-employer-${index}`} placeholder={ex("Construction Tremblay")} />
                      </Field>
                    )}
                  />
                  <Controller
                    name={`experiences.${index}.location`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`cv-exp-location-${index}`}>Endroit</FieldLabel>
                        <Input {...field} id={`cv-exp-location-${index}`} placeholder={ex("Québec")} />
                      </Field>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    name={`experiences.${index}.startedOn`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`cv-exp-start-${index}`}>Début</FieldLabel>
                        <Input {...field} id={`cv-exp-start-${index}`} type="date" />
                      </Field>
                    )}
                  />
                  <Controller
                    name={`experiences.${index}.endedOn`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`cv-exp-end-${index}`}>Fin</FieldLabel>
                        <Input {...field} id={`cv-exp-end-${index}`} type="date" />
                        <FieldDescription>Vide si vous y êtes encore.</FieldDescription>
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  name={`experiences.${index}.description`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`cv-exp-desc-${index}`}>Ce que vous y faisiez</FieldLabel>
                      <Textarea {...field} id={`cv-exp-desc-${index}`} rows={3} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            disabled={experiences.fields.length >= 20}
            onClick={() =>
              experiences.append({
                title: "",
                employer: "",
                location: "",
                startedOn: "",
                endedOn: "",
                description: "",
              })
            }
          >
            <Plus className="size-4" />
            Ajouter une expérience
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formation</CardTitle>
          <CardDescription>Diplômes, attestations, cours suivis.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {education.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune formation inscrite.</p>
          )}

          {education.fields.map((row, index) => (
            <div key={row.id} className="rounded-lg border border-border p-3">
              <FieldGroup>
                <div className="flex items-start gap-3">
                  <Controller
                    name={`education.${index}.program`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="flex-1">
                        <FieldLabel htmlFor={`cv-edu-program-${index}`}>
                          Formation
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          {...field}
                          id={`cv-edu-program-${index}`}
                          placeholder={ex("DEP Charpenterie-menuiserie")}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    onClick={() => education.remove(index)}
                    aria-label={`Retirer la formation ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    name={`education.${index}.school`}
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor={`cv-edu-school-${index}`}>Établissement</FieldLabel>
                        <Input {...field} id={`cv-edu-school-${index}`} placeholder={ex("CFP de Lévis")} />
                      </Field>
                    )}
                  />
                  <Controller
                    name={`education.${index}.completedYear`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`cv-edu-year-${index}`}>Année</FieldLabel>
                        <Input
                          {...field}
                          id={`cv-edu-year-${index}`}
                          inputMode="numeric"
                          placeholder={ex("2014")}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                </div>
              </FieldGroup>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            disabled={education.fields.length >= 10}
            onClick={() => education.append({ program: "", school: "", completedYear: "", notes: "" })}
          >
            <GraduationCap className="size-4" />
            Ajouter une formation
          </Button>
        </CardContent>

        <CardFooter>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Enregistrer mon CV
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
