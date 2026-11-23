"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Star, Tags, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  useDeletePricePolicy,
  usePricePoliciesQuery,
  useSavePricePolicy,
} from "@/hooks/use-price-policies";
import { ApiError } from "@/lib/api";
import type { PricePolicy } from "@/lib/types";
import { ex } from "@/lib/placeholders";

/** "35", "35,5" and "35.5" all: a margin is written with a comma here, to three decimals. */
const PERCENT = /^\d+([.,]\d{1,3})?$/;

/** An amount as this form takes it: "5", "4,99", "1200". Blank is handled separately. */
const AMOUNT = /^\d+([.,]\d{1,2})?$/;

/** "35" or "35,5" to a number. The form speaks with a comma; the API speaks with a dot. */
function toNumber(value: string): number {
  return Number(value.replace(/\s/g, "").replace(",", "."));
}

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis.").max(100, "100 caractères maximum."),
    marginPercent: z
      .string()
      .trim()
      .min(1, "La marge est requise.")
      .refine((value) => PERCENT.test(value.replace(/\s/g, "")), {
        message: "Écrivez un pourcentage, par exemple 35 ou 35,5.",
      }),
    description: z.string().trim().max(500, "500 caractères maximum."),
    isDefault: z.boolean(),
    tiers: z.array(
      z.object({
        from: z.string().trim(),
        /** Blank on the last band, which means "et plus". */
        to: z.string().trim(),
        marginPercent: z.string().trim(),
      }),
    ),
  })
  // Checked across the rows rather than one field at a time: a band is only right or wrong
  // next to its neighbours, and per-field rules cannot see the row above.
  .superRefine((values, context) => {
    const rows = values.tiers;

    rows.forEach((row, index) => {
      if (!AMOUNT.test(row.from.replace(/\s/g, ""))) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index, "from"],
          message: "Un montant, par exemple 1 ou 4,99.",
        });
      }

      if (row.to !== "" && !AMOUNT.test(row.to.replace(/\s/g, ""))) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index, "to"],
          message: "Un montant, ou vide pour « et plus ».",
        });
      }

      if (!PERCENT.test(row.marginPercent.replace(/\s/g, ""))) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index, "marginPercent"],
          message: "Un pourcentage, par exemple 60.",
        });
        return;
      }

      const from = toNumber(row.from);
      const to = row.to === "" ? null : toNumber(row.to);

      if (to !== null && to < from) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index, "to"],
          message: "La fin doit être au-dessus du début.",
        });
      }

      // Only the last band may be open-ended: one in the middle would swallow every band
      // above it, and the table would stop meaning what it says.
      if (to === null && index !== rows.length - 1) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index, "to"],
          message: "Seul le dernier palier peut rester ouvert.",
        });
      }

      const next = rows[index + 1];
      if (next && to !== null && AMOUNT.test(next.from.replace(/\s/g, "")) && toNumber(next.from) <= to) {
        context.addIssue({
          code: "custom",
          path: ["tiers", index + 1, "from"],
          message: "Ce palier chevauche le précédent.",
        });
      }
    });
  });

type FormValues = z.infer<typeof formSchema>;

function percent(value: number): string {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 }).format(value);
}

function amount(value: number): string {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value);
}

function money(value: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}

function toFormValues(policy?: PricePolicy): FormValues {
  return {
    name: policy?.name ?? "",
    marginPercent: policy ? percent(policy.marginPercent) : "",
    description: policy?.description ?? "",
    isDefault: policy?.isDefault ?? false,
    tiers: (policy?.tiers ?? []).map((tier) => ({
      from: amount(tier.fromAmount),
      to: tier.toAmount == null ? "" : amount(tier.toAmount),
      marginPercent: percent(tier.marginPercent),
    })),
  };
}

/** How a band reads in the table: « 1 $ à 5 $ », « 50 $ et plus ». */
function tierRange(tier: { fromAmount: number; toAmount: number | null }): string {
  return tier.toAmount == null
    ? `${money(tier.fromAmount)} et plus`
    : `${money(tier.fromAmount)} à ${money(tier.toAmount)}`;
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * The bands, as a small table inside the sheet.
 *
 * A contractor does not charge the same percentage on a 2 $ box of screws as on a 2 000 $
 * window: the cheap end carries the handling — the trip to the counter costs the same either way
 * — so the margin there is high and comes down as the price rises.
 *
 * The band is read against the PURCHASE price, which the heading says out loud. It has to be:
 * the margin is what turns a cost into a price, so a band on the selling price would need the
 * answer before it could pick the rule that produces it.
 *
 * Gaps are allowed and the flat margin covers them. Overlaps are refused, here and again on the
 * API: two bands covering 4 $ would make the price of a 4 $ item depend on which row happened to
 * be read first.
 */
function TierEditor({ form }: { form: UseFormReturn<FormValues> }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "tiers" });

  function addTier() {
    const previous = form.getValues("tiers").at(-1);

    // The new band starts where the last one ended, which is what somebody filling a table in
    // means by "the next one". A first band starts at zero.
    const start =
      previous && previous.to !== "" && AMOUNT.test(previous.to.replace(/\s/g, ""))
        ? amount(toNumber(previous.to) + 0.01)
        : previous
          ? ""
          : "0";

    append({ from: start, to: "", marginPercent: "" });
  }

  return (
    <Field>
      <FieldLabel>Paliers de marge</FieldLabel>
      <FieldDescription>
        Une marge différente selon le prix d&apos;achat. Par exemple : de 1 $ à 5 $, 60 %. Un prix
        qui ne tombe dans aucun palier prend la marge ci-dessus.
      </FieldDescription>

      {fields.length > 0 && (
        <div className="space-y-2">
          {/* The headings sit above the rows rather than inside each one: three labels repeated
              on every line is more words than table. */}
          <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_1fr_auto]">
            <span>À partir de</span>
            <span>Jusqu&apos;à</span>
            <span>Marge</span>
            <span className="w-9" />
          </div>

          {fields.map((row, index) => (
            <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Controller
                name={`tiers.${index}.from`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <div>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        inputMode="decimal"
                        aria-label={`Début du palier ${index + 1}`}
                        aria-invalid={fieldState.invalid}
                      />
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </div>
                )}
              />

              <Controller
                name={`tiers.${index}.to`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <div>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        inputMode="decimal"
                        placeholder="et plus"
                        aria-label={`Fin du palier ${index + 1}`}
                        aria-invalid={fieldState.invalid}
                      />
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </div>
                )}
              />

              <Controller
                name={`tiers.${index}.marginPercent`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <div>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        inputMode="decimal"
                        aria-label={`Marge du palier ${index + 1}`}
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>%</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </div>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer le palier ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addTier}>
        <Plus />
        Ajouter un palier
      </Button>
    </Field>
  );
}

function PolicyFormSheet({
  open,
  onOpenChange,
  policy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: PricePolicy;
}) {
  const isEditing = Boolean(policy);
  const save = useSavePricePolicy();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(policy),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(policy));
  }, [open, policy, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: policy?.id,
        values: {
          name: values.name,
          marginPercent: toNumber(values.marginPercent),
          description: values.description || null,
          isDefault: values.isDefault,
          tiers: values.tiers.map((tier) => ({
            fromAmount: toNumber(tier.from),
            toAmount: tier.to === "" ? null : toNumber(tier.to),
            marginPercent: toNumber(tier.marginPercent),
          })),
        },
      });
      toast.success(isEditing ? "Politique mise à jour." : "Politique ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(message(error, "Impossible d'enregistrer cette politique."));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier la politique" : "Nouvelle politique"}</SheetTitle>
          <SheetDescription>
            Un nom et une marge. C&apos;est ce qu&apos;un projet ou une facture utilise pour
            fixer le prix de ses lignes de catalogue.
          </SheetDescription>
        </SheetHeader>

        <form
          id="price-policy-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="policy-name">
                    Nom
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="policy-name"
                    required
                    placeholder={ex("Résidentiel")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="marginPercent"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="max-w-40">
                  <FieldLabel htmlFor="policy-margin">
                    Marge
                    <RequiredMark />
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="policy-margin"
                      required
                      inputMode="decimal"
                      placeholder={ex("35")}
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>%</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <FieldDescription>
              Zéro est une politique valable : c&apos;est ainsi qu&apos;on facture au prix
              coûtant les matériaux d&apos;un client. C&apos;est aussi la marge utilisée hors
              des paliers ci-dessous.
            </FieldDescription>

            <TierEditor form={form} />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="policy-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="policy-description"
                    rows={2}
                    placeholder={ex("Travaux résidentiels, clients particuliers.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isDefault"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="policy-default"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="policy-default">Politique par défaut</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              Utilisée par un projet ou une facture qui n&apos;en nomme aucune. Une seule
              politique la porte : la cocher ici la retire de l&apos;autre.
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="price-policy-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter la politique"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The company's named margins. A policy is a name plus a margin; it is what a project or an
 * invoice uses to price its catalogue lines, which is how changing who the work is for changes
 * the prices without anyone retyping them.
 */
export function PricePoliciesCard() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = usePricePoliciesQuery();
  const save = useSavePricePolicy();
  const remove = useDeletePricePolicy();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PricePolicy | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PricePolicy | undefined>(undefined);

  const policies = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(policy: PricePolicy) {
    setEditing(policy);
    setFormOpen(true);
  }

  async function markDefault(policy: PricePolicy) {
    try {
      await save.mutateAsync({
        id: policy.id,
        values: {
          name: policy.name,
          marginPercent: policy.marginPercent,
          description: policy.description,
          isDefault: true,
          // Sent back as they are. The save replaces the whole table, so leaving them out of
          // this one request would delete a company's bands for ticking a star.
          tiers: policy.tiers,
        },
      });
      toast.success(`« ${policy.name} » est maintenant la politique par défaut.`);
    } catch (error) {
      toast.error(message(error, "Impossible de changer la politique par défaut."));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Politique supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      // The API refuses and says how many projects or invoices still point at it, which is the
      // one thing worth reading here.
      toast.error(message(error, "Impossible de supprimer cette politique."));
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle politique
    </Button>
  );

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="size-4" />
              Politiques de prix
            </CardTitle>
            <CardDescription className="mt-1">
              Un nom et une marge, choisis sur un projet ou une facture.
            </CardDescription>
          </div>
          {createButton}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : isError && (!data || isPlaceholderData) ? (
          /* An error is not an empty list. "Aucune politique" after a failed request tells
             someone their pricing is gone, when it was simply not read.
             And `isError` alone is too wide: a failed background refetch keeps it true over rows
             that are still right, so the panel only wins with nothing read at all (`!data`) or rows
             left over from another query key (`isPlaceholderData`). */
          <LoadErrorState
            error={loadError}
            title="Politiques indisponibles"
            fallback="Vos politiques de prix n'ont pas pu être chargées."
            onRetry={() => refetch()}
          />
        ) : policies.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Aucune politique de prix"
            description="Par exemple « Résidentiel 35 % » et « Commercial 25 % » : les prix du catalogue suivent celle que porte le projet."
            action={createButton}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead className="w-24 text-right">Marge</TableHead>
                <TableHead className="w-32">Par défaut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy) => (
                <ClickableRow
                  key={policy.id}
                  label={`Modifier la politique ${policy.name}`}
                  onOpen={() => openEdit(policy)}
                >
                  <TableCell className="font-medium">
                    {policy.name}
                    {policy.description && (
                      <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                        {policy.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(policy.marginPercent)} %
                    {/* The bands, under the flat margin. A policy with bands whose list shows
                        only one percentage would be lying about what it charges. */}
                    {policy.tiers.length > 0 && (
                      <div className="mt-0.5 space-y-0.5 text-xs font-normal text-muted-foreground">
                        {policy.tiers.map((tier) => (
                          <div key={`${tier.fromAmount}-${tier.toAmount ?? "plus"}`}>
                            {tierRange(tier)} : {percent(tier.marginPercent)} %
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {policy.isDefault ? (
                      <Badge variant="default">Par défaut</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions pour ${policy.name}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(policy)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        {!policy.isDefault && (
                          <DropdownMenuItem
                            disabled={save.isPending}
                            onClick={() => markDefault(policy)}
                          >
                            <Star />
                            Définir par défaut
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(policy)}
                        >
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PolicyFormSheet open={formOpen} onOpenChange={setFormOpen} policy={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette politique ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.name} » sera supprimée. Un projet ou une facture qui l'utilise encore bloque la suppression.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}
