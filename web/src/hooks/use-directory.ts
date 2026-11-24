import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  DirectoryCompany,
  DirectoryJob,
  DirectoryProduct,
  DirectorySummary,
  EmploymentType,
  PagedResult,
} from "@/lib/types";

/**
 * Everything published across Vexta, read from the outside in.
 *
 * The company pages answer "what does this company offer". These answer the question from the
 * other side — who is hiring, who sells this — which is the only way somebody who does not
 * already know a company's name finds it.
 *
 * The search term goes to the server rather than filtering a loaded list: the directory is
 * every published page on the platform, and that is not a list to hold in a browser.
 */
export function useDirectorySummaryQuery() {
  return useQuery({
    queryKey: ["annuaire", "sommaire"],
    queryFn: () => api.get<DirectorySummary>("public/annuaire/sommaire"),
    // A company publishing its page is not news that has to reach anybody mid-sentence.
    staleTime: 5 * 60 * 1000,
  });
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const text = search.toString();
  return text ? `?${text}` : "";
}

export function useDirectoryCompaniesQuery(search: string, page: number) {
  return useQuery({
    queryKey: ["annuaire", "entreprises", search, page],
    queryFn: () =>
      api.get<PagedResult<DirectoryCompany>>(
        `public/annuaire/entreprises${query({ recherche: search, page })}`,
      ),
    // The previous page stays on screen while the next one loads, so typing in the search box
    // does not empty the grid between keystrokes.
    placeholderData: (previous) => previous,
  });
}

export function useDirectoryJobsQuery(search: string, type: EmploymentType | "", page: number) {
  return useQuery({
    queryKey: ["annuaire", "emplois", search, type, page],
    queryFn: () =>
      api.get<PagedResult<DirectoryJob>>(
        `public/annuaire/emplois${query({ recherche: search, type: type || undefined, page })}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useDirectoryProductsQuery(search: string, category: string, page: number) {
  return useQuery({
    queryKey: ["annuaire", "produits", search, category, page],
    queryFn: () =>
      api.get<PagedResult<DirectoryProduct>>(
        `public/annuaire/produits${query({ recherche: search, categorie: category || undefined, page })}`,
      ),
    placeholderData: (previous) => previous,
  });
}
