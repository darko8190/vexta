"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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

const formSchema = z.object({
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
});

type FormValues = z.infer<typeof formSchema>;

function percent(value: number): string {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 }).format(value);
}

function toFormValues(policy?: PricePolicy): FormValues {
  return {
    name: policy?.name ?? "",
    marginPercent: policy ? percent(policy.marginPercent) : "",
    description: policy?.description ?? "",
    isDefault: policy?.isDefault ?? false,
  };
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
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
          marginPercent: Number(values.marginPercent.replace(/\s/g, "").replace(",", ".")),
          description: values.description || null,
          isDefault: values.isDefault,
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
              coûtant les matériaux d&apos;un client.
            </FieldDescription>

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
          {policies.length > 0 && createButton}
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
