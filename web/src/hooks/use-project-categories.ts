import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectCategory, ProjectSubCategory } from "@/lib/types";

/** The company's own categories for its jobs, with their sub-categories. */
export function useProjectCategoriesQuery() {
  return useQuery({
    queryKey: ["project-categories"],
    queryFn: () => api.get<ProjectCategory[]>("project-categories"),
  });
}

/** Creating a category that already exists returns the existing one rather than failing. */
export function useCreateProjectCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<ProjectCategory>("project-categories", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-categories"] }),
  });
}

export function useCreateProjectSubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      api.post<ProjectSubCategory>(`project-categories/${categoryId}/subcategories`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-categories"] }),
  });
}
