import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EmploymentType, JobPosting, PublicPageSettings } from "@/lib/types";

export interface PublicPageValues {
  isPublished: boolean;
  headline: string | null;
  about: string | null;
  contactNote: string | null;
  showProducts: boolean;
  showJobs: boolean;
}

export interface JobPostingValues {
  title: string;
  description: string | null;
  location: string | null;
  employmentType: EmploymentType;
  compensation: string | null;
  applyTo: string | null;
  isPublished: boolean;
}

export function usePublicPageQuery() {
  return useQuery({
    queryKey: ["company", "public-page"],
    queryFn: () => api.get<PublicPageSettings>("company/public-page"),
  });
}

export function useSavePublicPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PublicPageValues) => api.put<PublicPageSettings>("company/public-page", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company", "public-page"] }),
  });
}

/**
 * `enabled` is there for the badge on the Entreprise rail, which is drawn before the section is
 * opened. The endpoint is the owner's, so an employee asking for it gets a 403 — a refusal the
 * screen would then have to explain for a number nobody asked to see.
 */
export function useJobPostingsQuery(enabled = true) {
  return useQuery({
    queryKey: ["company", "jobs"],
    queryFn: () => api.get<JobPosting[]>("company/jobs"),
    enabled,
  });
}

export function useSaveJobPosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: JobPostingValues }) =>
      id ? api.put<JobPosting>(`company/jobs/${id}`, values) : api.post<JobPosting>("company/jobs", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company", "jobs"] }),
  });
}

export function useDeleteJobPosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`company/jobs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company", "jobs"] }),
  });
}
