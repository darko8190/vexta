"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { decimalField, parseDecimal } from "@/components/products/product-format";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  useCreateProductCategory,
  useCreateProductSubCategory,
  useMarginMode,
  useProductCategoriesQuery,
  useSaveProduct,
} from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { marginPercentFrom, sellingPriceFrom } from "@/lib/pricing";
import type { ProductRecord } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  code: z.string().trim().max(60, "60 caractères maximum."),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(4000, "4000 caractères maximum."),
  unit: z.string().trim().max(20, "20 caractères maximum."),
  categoryId: z.string(),
  subCategoryId: z.string(),
  barcode: z.string().trim().max(64, "64 caractères maximum."),
  minimumQuantity: z.string(),
  maximumQuantity: z.string(),
  tracksInventory: z.boolean(),
  isManufactured: z.boolean(),
  quantityOnHand: z.string(),
  purchasePrice: z.string(),
  marginPercent: z.string(),
  sellingPrice: z.string(),
  installationMinutes: z.string(),
  note: z.string().trim().max(4000, "4000 caractères maximum."),
  isPublic: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function emptyValues(): FormValues {
  return {
    code: "",
    title: "",
    description: "",
    unit: "",
    categoryId: "",
    subCategoryId: "",
    barcode: "",
    minimumQuantity: "",
    maximumQuantity: "",
    // Most of what a contractor stocks is counted, so the box starts ticked.
    tracksInventory: true,
    isManufactured: false,
    quantityOnHand: "",
    purchasePrice: "",
    marginPercent: "",
    sellingPrice: "",
    installationMinutes: "",
    note: "",
    isPublic: false,
  };
}

/**
 * The whole product on one panel.
 *
 * Prix d'achat, Marge and Prix de vente answer each other as they are typed, the way they do on
 * a quote pad: two of them settle the third. The one being typed is never overwritten, so a
 * price rounded to something sellable stays as typed and the margin becomes whatever it is.
 */
export function ProductFormSheet({
  open,
  onOpenChange,
  product,
  parentProductId,
  parentTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductRecord;
  /** Set when the panel is opened from a product's Variantes section. */
  parentProductId?: string;
  parentTitle?: string;
}) {
  const isEditing = Boolean(product);
  const save = useSaveProduct();
  const marginMode = useMarginMode();
  const { data: categories, isLoading: categoriesLoading } = useProductCategoriesQuery();
  const createCategory = useCreateProductCategory();
  const createSubCategory = useCreateProductSubCategory();

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [addingSubCategory, setAddingSubCategory] = useState(false);
  const [newSubCategory, setNewSubCategory] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (!open) return;

    form.reset(
      product
        ? {
            code: product.code ?? "",
            title: product.title,
            description: product.description ?? "",
            unit: product.unit ?? "",
            categoryId: product.categoryId ?? "",
            subCategoryId: product.subCategoryId ?? "",
            barcode: product.barcode ?? "",
            minimumQuantity: decimalField(product.minimumQuantity),
            maximumQuantity: decimalField(product.maximumQuantity),
            tracksInventory: product.tracksInventory,
            isManufactured: product.isManufactured,
            quantityOnHand: decimalField(product.quantityOnHand),
            purchasePrice: decimalField(product.purchasePrice),
            marginPercent: decimalField(product.marginPercent),
            sellingPrice: decimalField(product.sellingPrice),
            installationMinutes: product.installationMinutes == null ? "" : String(product.installationMinutes),
            note: product.note ?? "",
            isPublic: product.isPublic,
          }
        : emptyValues(),
    );
  }, [open, product, form]);

  // useWatch, not form.watch: the React Compiler lint rejects the latter inside render.
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const tracksInventory = useWatch({ control: form.control, name: "tracksInventory" });

  // The second dropdown lists the chosen category's own sub-categories. Listing every
  // sub-category the company has ever made would offer "Cuivre" under Électricité.
  const subCategories = categories?.find((category) => category.id === categoryId)?.subCategories ?? [];

  /** Vendant from the two fields above it, whenever both are readable. */
  function repriceSelling(purchaseRaw: string, marginRaw: string) {
    const purchase = parseDecimal(purchaseRaw);
    const margin = parseDecimal(marginRaw, { places: 3 });
    if (purchase === "invalid" || margin === "invalid" || purchase == null || margin == null) return;

    const selling = sellingPriceFrom(purchase, margin, marginMode);
    if (selling != null) form.setValue("sellingPrice", decimalField(selling));
  }

  /** And the other way: a price typed by hand says what the margin really is. */
  function repriceMargin(sellingRaw: string) {
    const purchase = parseDecimal(form.getValues("purchasePrice"));
    const selling = parseDecimal(sellingRaw);
    if (purchase === "invalid" || selling === "invalid" || purchase == null || selling == null) return;

    const margin = marginPercentFrom(purchase, selling, marginMode);
    if (margin != null) form.setValue("marginPercent", decimalField(margin));
  }

  async function onAddCategory() {
    const name = newCategory.trim();
    if (!name) return;

    try {
      const created = await createCategory.mutateAsync(name);
      form.setValue("categoryId", created.id, { shouldValidate: true });
      form.setValue("subCategoryId", "");
      setNewCategory("");
      setAddingCategory(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer cette catégorie.");
    }
  }

  async function onAddSubCategory() {
    const name = newSubCategory.trim();
    if (!name || !categoryId) return;

    try {
      const created = await createSubCategory.mutateAsync({ categoryId, name });
      form.setValue("subCategoryId", created.id, { shouldValidate: true });
      setNewSubCategory("");
      setAddingSubCategory(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer cette sous-catégorie.");
    }
  }

  async function onSubmit(values: FormValues) {
    const purchasePrice = parseDecimal(values.purchasePrice);
    const sellingPrice = parseDecimal(values.sellingPrice);
    const marginPercent = parseDecimal(values.marginPercent, { places: 3 });
    const minimumQuantity = parseDecimal(values.minimumQuantity, { places: 3 });
    const maximumQuantity = parseDecimal(values.maximumQuantity, { places: 3 });
    const quantityOnHand = parseDecimal(values.quantityOnHand, { places: 3 });
    const installationMinutes = parseDecimal(values.installationMinutes, { places: 0 });

    if (purchasePrice === "invalid" || sellingPrice === "invalid" || marginPercent === "invalid") {
      toast.error("Un montant doit s'écrire comme 1250 ou 1250,99.");
      return;
    }

    if (minimumQuantity === "invalid" || maximumQuantity === "invalid" || quantityOnHand === "invalid") {
      toast.error("Une quantité doit s'écrire comme 12 ou 12,5.");
      return;
    }

    if (installationMinutes === "invalid") {
      toast.error("Le temps d'installation s'écrit en minutes entières.");
      return;
    }

    try {
      await save.mutateAsync({
        id: product?.id,
        values: {
          code: values.code || null,
          title: values.title,
          description: values.description || null,
          unit: values.unit || null,
          categoryId: values.categoryId || null,
          subCategoryId: values.categoryId ? values.subCategoryId || null : null,
          barcode: values.barcode || null,
          // Dropped rather than sent for a product nobody counts: a figure left in a disabled
          // field would otherwise become an opening stock movement for sand sold by the truckload.
          minimumQuantity: values.tracksInventory ? minimumQuantity : null,
          maximumQuantity: values.tracksInventory ? maximumQuantity : null,
          tracksInventory: values.tracksInventory,
          isManufactured: values.isManufactured,
          quantityOnHand: values.tracksInventory ? (quantityOnHand ?? 0) : 0,
          purchasePrice,
          marginPercent,
          sellingPrice,
          installationMinutes,
          note: values.note || null,
          parentProductId: product?.parentProductId ?? parentProductId ?? null,
          isPublic: values.isPublic,
        },
      });

      toast.success(isEditing ? "Produit mis à jour." : "Produit ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce produit.");
    }
  }

  const isVariant = Boolean(product?.parentProductId ?? parentProductId);
  const parentName = product?.parentTitle ?? parentTitle;

  return (
    <Sheet
      open={open}
      // Cleared as the panel closes rather than as it opens: the same reset, but in an event
      // handler, where it cannot cascade a render.
      onOpenChange={(next) => {
        if (!next) {
          setAddingCategory(false);
          setNewCategory("");
          setAddingSubCategory(false);
          setNewSubCategory("");
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? isVariant
                ? "Modifier la variante"
                : "Modifier le produit"
              : isVariant
                ? "Nouvelle variante"
                : "Nouveau produit"}
          </SheetTitle>
          <SheetDescription>
            {isVariant && parentName
              ? `Une déclinaison de « ${parentName} » : son propre code, sa propre quantité, son propre prix.`
              : "Ce que vous gardez en stock, installez ou revendez."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="product-form"
          className="flex-1 overflow-y-auto px-4"
          // Stops here rather than bubbling: this panel is opened from pages that may themselves
          // sit inside a form, and React routes a submit up its own tree regardless of where the
          // portal puts the markup.
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-title">
                    Titre <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="product-title"
                    placeholder={ex("Coude cuivre 1/2 po")}
                    aria-invalid={fieldState.invalid}
                    aria-required="true"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="code"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-code">Code</FieldLabel>
                    <Input {...field} id="product-code" placeholder={ex("CU-COUDE-12")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Votre référence, pas la nôtre.</FieldDescription>
                    )}
                  </Field>
                )}
              />

              <Controller
                name="barcode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-barcode">Code à barres</FieldLabel>
                    <Input {...field} id="product-barcode" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Celui imprimé sur la boîte.</FieldDescription>
                    )}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-description">Description</FieldLabel>
                  <Textarea {...field} id="product-description" rows={3} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="categoryId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="product-category">Catégorie</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      // null, not undefined: Base UI reads undefined as an uncontrolled select
                      // and warns when a value later makes it controlled.
                      value={field.value || null}
                      onValueChange={(value) => {
                        field.onChange(value ?? "");
                        // The sub-category belonged to the category being left behind.
                        form.setValue("subCategoryId", "");
                        setAddingSubCategory(false);
                      }}
                    >
                      <SelectTrigger id="product-category" className="w-full">
                        {/* The stored value is a GUID, so the name is looked up rather than shown
                            as itself. The empty case is handled here too: these children render
                            even when nothing is selected, so the placeholder prop never gets a turn. */}
                        <SelectValue>
                          {(id: string) =>
                            !id
                              ? categoriesLoading
                                ? "Chargement…"
                                : "Aucune catégorie"
                              : (categories?.find((category) => category.id === id)?.name ?? "Chargement…")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(categories ?? []).map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Ajouter une catégorie"
                      onClick={() => setAddingCategory((current) => !current)}
                    >
                      <Plus />
                    </Button>
                  </div>

                  {addingCategory && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newCategory}
                        onChange={(event) => setNewCategory(event.target.value)}
                        placeholder={ex("Plomberie")}
                        aria-label="Nom de la nouvelle catégorie"
                        onKeyDown={(event) => {
                          // Enter adds the category instead of submitting the product, which
                          // would save it without the category being created for it.
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={onAddCategory}
                        disabled={createCategory.isPending || !newCategory.trim()}
                      >
                        {createCategory.isPending && <Spinner />}
                        Ajouter
                      </Button>
                    </div>
                  )}

                  <FieldDescription>Votre liste. Ajoutez-en une avec le bouton quand il en manque.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="subCategoryId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="product-subcategory">Sous-catégorie</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      value={field.value || null}
                      onValueChange={(value) => field.onChange(value ?? "")}
                      disabled={!categoryId}
                    >
                      <SelectTrigger id="product-subcategory" className="w-full">
                        <SelectValue>
                          {(id: string) =>
                            !id
                              ? categoryId
                                ? "Aucune sous-catégorie"
                                : "Choisissez une catégorie"
                              : (subCategories.find((sub) => sub.id === id)?.name ?? "Chargement…")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {subCategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Ajouter une sous-catégorie"
                      disabled={!categoryId}
                      onClick={() => setAddingSubCategory((current) => !current)}
                    >
                      <Plus />
                    </Button>
                  </div>

                  {addingSubCategory && categoryId && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newSubCategory}
                        onChange={(event) => setNewSubCategory(event.target.value)}
                        placeholder={ex("Cuivre")}
                        aria-label="Nom de la nouvelle sous-catégorie"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddSubCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={onAddSubCategory}
                        disabled={createSubCategory.isPending || !newSubCategory.trim()}
                      >
                        {createSubCategory.isPending && <Spinner />}
                        Ajouter
                      </Button>
                    </div>
                  )}

                  <FieldDescription>Celles de la catégorie choisie.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="tracksInventory"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="product-tracks"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="product-tracks" className="font-normal">
                      Suivre l&apos;inventaire
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    Décochez-le pour ce qui se vend au mètre ou au voyage : les quantités ne veulent
                    alors rien dire et les écrans le disent plutôt que d&apos;afficher un zéro.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="isManufactured"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="product-manufactured"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="product-manufactured" className="font-normal">
                      Fabriqué par l&apos;entreprise
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    Cochez-le pour un produit que vous fabriquez vous-même, sur votre chaîne de
                    production, plutôt que de l&apos;acheter.
                  </FieldDescription>
                </Field>
              )}
            />

            {/* Alone in a three-column grid so it lines up above Quantité, which is the figure it
                qualifies, and keeps the width of a short abbreviation. Outside the grid below it
                because it stays usable for a product nobody counts: sand sold by the truckload has
                no quantity but is still sold "au voyage". */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                name="unit"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-unit">Unité</FieldLabel>
                    <Input
                      {...field}
                      id="product-unit"
                      placeholder={ex("un, pi, pi², m, kg, h, sac")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <FieldDescription>
              Comment ce produit se compte et se vend. Elle suit la quantité et le prix partout
              où ils s&apos;affichent, et se retrouve sur les lignes qui prennent ce produit.
            </FieldDescription>

            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                name="quantityOnHand"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-quantity">Quantité</FieldLabel>
                    <Input
                      {...field}
                      id="product-quantity"
                      inputMode="decimal"
                      placeholder={ex("0")}
                      disabled={!tracksInventory}
                    />
                  </Field>
                )}
              />
              <Controller
                name="minimumQuantity"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-minimum">Minimum</FieldLabel>
                    <Input
                      {...field}
                      id="product-minimum"
                      inputMode="decimal"
                      placeholder={ex("0")}
                      disabled={!tracksInventory}
                    />
                  </Field>
                )}
              />
              <Controller
                name="maximumQuantity"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-maximum">Maximum</FieldLabel>
                    <Input
                      {...field}
                      id="product-maximum"
                      inputMode="decimal"
                      placeholder={ex("0")}
                      disabled={!tracksInventory}
                    />
                  </Field>
                )}
              />
            </div>

            <FieldDescription>
              {tracksInventory
                ? "Le minimum est le moment de recommander ; le maximum, ce qui est trop à garder."
                : "Ce produit n'est pas compté, alors ces trois cases restent vides."}
            </FieldDescription>

            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                name="purchasePrice"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-purchase">Prix d&apos;achat</FieldLabel>
                    <Input
                      {...field}
                      id="product-purchase"
                      inputMode="decimal"
                      placeholder={ex("0,00")}
                      onChange={(event) => {
                        field.onChange(event);
                        repriceSelling(event.target.value, form.getValues("marginPercent"));
                      }}
                    />
                  </Field>
                )}
              />
              <Controller
                name="marginPercent"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-margin">Marge (%)</FieldLabel>
                    <Input
                      {...field}
                      id="product-margin"
                      inputMode="decimal"
                      placeholder={ex("0")}
                      onChange={(event) => {
                        field.onChange(event);
                        repriceSelling(form.getValues("purchasePrice"), event.target.value);
                      }}
                    />
                  </Field>
                )}
              />
              <Controller
                name="sellingPrice"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="product-selling">Prix de vente</FieldLabel>
                    <Input
                      {...field}
                      id="product-selling"
                      inputMode="decimal"
                      placeholder={ex("0,00")}
                      onChange={(event) => {
                        field.onChange(event);
                        repriceMargin(event.target.value);
                      }}
                    />
                  </Field>
                )}
              />
            </div>

            <FieldDescription>
              {marginMode === "Division"
                ? "Marge sur le prix de vente : 100 $ à 35 % donne 153,85 $."
                : "Marge sur le coût : 100 $ à 35 % donne 135 $."}
            </FieldDescription>

            <Controller
              name="installationMinutes"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="product-installation">Temps d&apos;installation</FieldLabel>
                  <Input {...field} id="product-installation" inputMode="numeric" placeholder={ex("30")} />
                  <FieldDescription>En minutes. C&apos;est ce qui bâtit une estimation.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-note">Note</FieldLabel>
                  <Textarea {...field} id="product-note" rows={2} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isPublic"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="product-public"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <FieldLabel htmlFor="product-public" className="font-normal">
                      Visible sur la page publique
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    Le titre, la description et le prix de vente, rien d&apos;autre.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="product-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : isVariant ? "Ajouter la variante" : "Ajouter le produit"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
