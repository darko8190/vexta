import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MySubscriptionStatus = "Incomplete" | "Active" | "PastDue" | "Canceled" | "Trialing" | "Unpaid";

/** A company this person runs. */
export interface MyCompany {
  tenantId: string;
  name: string;
  slug: string;
  planName: string | null;
  subscriptionStatus: MySubscriptionStatus | string;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface CreateMyCompanyValues {
  companyName: string;
  planId: string;
  profile: {
    line1: string;
    line2: string | null;
    city: string;
    province: string | null;
    postalCode: string;
    country: string;
    businessNumber: string | null;
  } | null;
}

export function useMyCompaniesQuery() {
  return useQuery({
    queryKey: ["mes-entreprises"],
    queryFn: () => api.get<MyCompany[]>("mes-entreprises"),
  });
}

export function useCreateMyCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateMyCompanyValues) =>
      api.post<{ tenantId: string; checkoutUrl: string | null }>("mes-entreprises", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-entreprises"] });
      // The new company joins the space switcher.
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
