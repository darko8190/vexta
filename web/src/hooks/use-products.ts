import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBillingSettingsQuery } from "@/hooks/use-billing-settings";
import { api, buildQuery } from "@/lib/api";
import type {
  MarginMode,
  PagedResult,
  ProductCategory,
  ProductImage,
  ProductPriceEntry,
  ProductRecord,
  ProductSearchResult,
  ProductSectionCounts,
  ProductStockEntry,
  ProductSubCategory,
} from "@/lib/types";

/** What the form sends. Only the title is required; everything else is allowed to be unknown. */
export interface ProductFormValues {
  code: string | null;
  title: string;
  description: string | null;
  /** How it is counted and sold: un, pi, m, sac. Null when the company has not said. */
  unit: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  barcode: string | null;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  tracksInventory: boolean;
  isManufactured: boolean;
  isParent: boolean;
  quantityOnHand: number;
  purchasePrice: number | null;
  marginPercent: number | null;
  sellingPrice: number | null;
  installationMinutes: number | null;
  note: string | null;
  /** Set to save this product as a variant of another one. */
  parentProductId: string | null;
  isPublic: boolean;
}

export interface ProductListFilters {
  page: number;
  search: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  lowStock?: boolean;
}

/**
 * Every write touches more than the row it changed: a price writes a history entry, a movement
 * changes three quantities and a badge, and a category is counted on the screen that lists it.
 * Invalidating the whole catalogue is cheaper than discovering which of those went stale.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["product-categories"] });
  if (id) queryClient.invalidateQueries({ queryKey: ["product", id] });
}

export function useProductsQuery(filters: ProductListFilters) {
  const { page, search, categoryId, subCategoryId, lowStock } = filters;

  return useQuery({
    queryKey: ["products", "list", page, search, categoryId ?? "", subCategoryId ?? "", lowStock ?? false],
    queryFn: () =>
      api.get<PagedResult<ProductRecord>>(
        `products${buildQuery({ page, search, categoryId, subCategoryId, lowStock: lowStock || undefined })}`,
      ),
  });
}

/**
 * Just the total, for the badge on the inventory rail. One row is asked for because the count
 * comes back with the page either way, and the rail is drawn before any list is opened.
 */
/**
 * The products to order: counted, with a minimum, and below it once what is on order is added
 * to what is available.
 */
export function useProductsToReorderQuery() {
  return useQuery({
    queryKey: ["products", "a-commander"],
    queryFn: () => api.get<ProductRecord[]>("products/a-commander"),
  });
}

export function useProductCountQuery() {
  return useQuery({
    queryKey: ["products", "count"],
    queryFn: () => api.get<PagedResult<ProductRecord>>(`products${buildQuery({ page: 1, pageSize: 1 })}`),
    select: (result) => result.totalCount,
  });
}

export function useProductQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => api.get<ProductRecord>(`products/${id}`),
    enabled: Boolean(id),
  });
}

export function useProductSummaryQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id, "summary"],
    queryFn: () => api.get<{ counts: ProductSectionCounts }>(`products/${id}/summary`),
    enabled: Boolean(id),
  });
}

export function useProductVariantsQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id, "variants"],
    queryFn: () => api.get<ProductRecord[]>(`products/${id}/variants`),
    enabled: Boolean(id),
  });
}

/** The images with their links. Signed on the way out and short-lived, so they are fetched on opening. */
export function useProductImagesQuery(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["product", id, "images"],
    queryFn: () => api.get<ProductImage[]>(`products/${id}/images`),
    enabled: Boolean(id) && enabled,
  });
}

export function useProductStockQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id, "stock"],
    queryFn: () => api.get<ProductStockEntry[]>(`products/${id}/stock`),
    enabled: Boolean(id),
  });
}

export function useProductPricesQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id, "prices"],
    queryFn: () => api.get<ProductPriceEntry[]>(`products/${id}/prices`),
    enabled: Boolean(id),
  });
}

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ProductFormValues }) =>
      id
        ? api.put<ProductRecord>(`products/${id}`, values)
        : api.post<ProductRecord>("products", values),
    onSuccess: (product) => invalidate(queryClient, product.id),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`products/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

/** The whole set every time: what is sent replaces what the product had. */
export function useSaveProductImages(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaAssetIds: string[]) =>
      api.post<ProductImage[]>(`products/${id}/images`, { mediaAssetIds }),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** A delivery, a count, a correction. The movement is applied and recorded in one go. */
export function useAddProductStock(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movement: { quantityChange: number; reason: string | null }) =>
      api.post<ProductStockEntry[]>(`products/${id}/stock`, movement),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useProductCategoriesQuery() {
  return useQuery({
    queryKey: ["product-categories"],
    queryFn: () => api.get<ProductCategory[]>("product-categories"),
  });
}

/** Creating a category that already exists returns the existing one rather than failing. */
export function useCreateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<ProductCategory>("product-categories", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-categories"] }),
  });
}

export function useCreateProductSubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      api.post<ProductSubCategory>(`product-categories/${categoryId}/subcategories`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-categories"] }),
  });
}

/** The catalogue as a line picker searches it: the name, the code, the barcode or the number. */
export function useProductSearchQuery(term: string, enabled = true) {
  return useQuery({
    queryKey: ["products", "search", term],
    queryFn: () => api.get<ProductSearchResult[]>(`products/search${buildQuery({ term, take: 20 })}`),
    enabled: enabled && term.trim().length > 0,
  });
}

/**
 * The company's margin convention, for the two fields that answer each other while someone
 * types. Read defensively: the setting is new, and a form that cannot price a product because
 * one field is missing from a response is worse than one that assumes the common convention.
 */
export function useMarginMode(): MarginMode {
  const { data } = useBillingSettingsQuery();
  // Multiplication until the settings answer: it is the company's own choice, and the two give
  // different prices from the same percentage, so guessing the other way round would quietly
  // overcharge while the request is in flight.
  return data?.marginMode ?? "Multiplication";
}
