"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  useCreateProjectCategory,
  useCreateProjectSubCategory,
  useProjectCategoriesQuery,
} from "@/hooks/use-project-categories";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

/** Base UI needs a value for every item, and "" is not one. */
const NONE = "aucune";

/**
 * A job's category and sub-category, each a dropdown with a + beside it to add one on the spot.
 *
 * The same behaviour as a product's: nobody leaves a half-written job to invent "Résidentiel"
 * on a settings screen first. The new entry is typed in place rather than in a dialog — it is
 * one word, and a dialog over a form for one word is more ceremony than the word.
 */
export function ProjectCategoryFields({
  categoryId,
  subCategoryId,
  onCategoryChange,
  onSubCategoryChange,
  disabled,
}: {
  categoryId: string;
  subCategoryId: string;
  /** The sub-category belongs to the category, so changing one clears the other — the caller's job. */
  onCategoryChange: (id: string) => void;
  onSubCategoryChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { data: categories, isLoading } = useProjectCategoriesQuery();
  const createCategory = useCreateProjectCategory();
  const createSubCategory = useCreateProjectSubCategory();

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [addingSubCategory, setAddingSubCategory] = useState(false);
  const [newSubCategory, setNewSubCategory] = useState("");

  const subCategories = categories?.find((category) => category.id === categoryId)?.subCategories ?? [];

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;

    try {
      const created = await createCategory.mutateAsync(name);
      onCategoryChange(created.id);
      onSubCategoryChange("");
      setNewCategory("");
      setAddingCategory(false);
      setAddingSubCategory(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer cette catégorie.");
    }
  }

  async function addSubCategory() {
    const name = newSubCategory.trim();
    if (!name || !categoryId) return;

    try {
      const created = await createSubCategory.mutateAsync({ categoryId, name });
      onSubCategoryChange(created.id);
      setNewSubCategory("");
      setAddingSubCategory(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer cette sous-catégorie.");
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="project-category">Catégorie</FieldLabel>
        <div className="flex gap-2">
          <Select
            value={categoryId || null}
            disabled={disabled}
            onValueChange={(value: string | null) => {
              onCategoryChange(!value || value === NONE ? "" : value);
              // The sub-category belonged to the category being left behind.
              onSubCategoryChange("");
              setAddingSubCategory(false);
            }}
          >
            <SelectTrigger id="project-category" className="w-full">
              <SelectValue>
                {(id: string) =>
                  !id
                    ? isLoading
                      ? "Chargement…"
                      : "Aucune catégorie"
                    : (categories?.find((category) => category.id === id)?.name ?? "Chargement…")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Aucune catégorie</SelectItem>
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
            size="icon"
            aria-label="Ajouter une catégorie"
            disabled={disabled}
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
              placeholder={ex("Résidentiel")}
              aria-label="Nom de la nouvelle catégorie"
              autoFocus
              onKeyDown={(event) => {
                // Enter adds the category instead of submitting the project, which would save
                // it without the category it was being created for.
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addCategory();
                }
              }}
            />
            <Button
              type="button"
              onClick={() => void addCategory()}
              disabled={createCategory.isPending || !newCategory.trim()}
            >
              {createCategory.isPending && <Spinner />}
              Ajouter
            </Button>
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="project-subcategory">Sous-catégorie</FieldLabel>
        <div className="flex gap-2">
          <Select
            value={subCategoryId || null}
            disabled={disabled || !categoryId}
            onValueChange={(value: string | null) => onSubCategoryChange(!value || value === NONE ? "" : value)}
          >
            <SelectTrigger id="project-subcategory" className="w-full">
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
              <SelectItem value={NONE}>Aucune sous-catégorie</SelectItem>
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
            size="icon"
            aria-label="Ajouter une sous-catégorie"
            disabled={disabled || !categoryId}
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
              placeholder={ex("Toiture")}
              aria-label="Nom de la nouvelle sous-catégorie"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addSubCategory();
                }
              }}
            />
            <Button
              type="button"
              onClick={() => void addSubCategory()}
              disabled={createSubCategory.isPending || !newSubCategory.trim()}
            >
              {createSubCategory.isPending && <Spinner />}
              Ajouter
            </Button>
          </div>
        )}
      </Field>

      <FieldDescription className="sm:col-span-2">
        Votre propre classement des projets. Le bouton + en ajoute une quand il en manque.
      </FieldDescription>
    </div>
  );
}
