"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { parseDecimal, quantity } from "@/components/products/product-format";
import { RequiredMark } from "@/components/ui/required-mark";
import { useAddProductStock } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  quantityChange: z.string().trim().min(1, "Indiquez une quantité."),
  reason: z.string().trim().max(200, "200 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * A movement of stock: a delivery, a count, a correction.
 *
 * It asks for the change rather than the new total, because that is what the person has in front
 * of them — six boxes arrived, two were broken — and it is what the history has to record for
 * the figure on the shelf to be explainable afterwards.
 */
export function StockMovementDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
  quantityOnHand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productTitle: string;
  quantityOnHand: number;
}) {
  const addStock = useAddProductStock(productId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { quantityChange: "", reason: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ quantityChange: "", reason: "" });
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    const change = parseDecimal(values.quantityChange, { allowNegative: true, places: 3 });

    if (change === "invalid") {
      toast.error("Une quantité s'écrit comme 6, -2 ou 2,5.");
      return;
    }

    if (change === null || change === 0) {
      toast.error("Indiquez une quantité autre que zéro.");
      return;
    }

    try {
      await addStock.mutateAsync({ quantityChange: change, reason: values.reason || null });
      toast.success("Inventaire ajusté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'ajuster l'inventaire.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuster l&apos;inventaire</DialogTitle>
          <DialogDescription>
            {`« ${productTitle} » : ${quantity(quantityOnHand)} en main en ce moment.`}
          </DialogDescription>
        </DialogHeader>

        <form
          id="stock-movement-form"
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="quantityChange"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="stock-change">
                    Quantité <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="stock-change"
                    inputMode="text"
                    placeholder={ex("6")}
                    aria-invalid={fieldState.invalid}
                    aria-required="true"
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Ce qui entre, ou ce qui sort avec un moins devant : 6, -2, 2,5.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="stock-reason">Raison</FieldLabel>
                  <Input
                    {...field}
                    id="stock-reason"
                    placeholder={ex("Réception Patrick Morin")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Dans vos mots. C&apos;est ce que l&apos;historique affichera.</FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="stock-movement-form" disabled={addStock.isPending}>
            {addStock.isPending && <Spinner />}
            Enregistrer le mouvement
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
