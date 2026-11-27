import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The employee file of the person signed in, when one is linked to their account. */
export function useMyEmployeeQuery() {
  return useQuery({
    queryKey: ["rh", "moi"],
    queryFn: () => api.get<{ id: string; name: string }>("rh/moi"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
