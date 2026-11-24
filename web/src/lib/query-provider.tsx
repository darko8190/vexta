"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const queryClient: QueryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15_000, retry: 1 },
      },
      // The sub-tab badges count rows across several screens, and any write can move one of
      // them. Refreshing them after every successful write is one small request, and only
      // while a rail that shows them is on screen — an inactive query is not refetched.
      mutationCache: new MutationCache({
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["section-counts"] });
        },
      }),
    });
    return queryClient;
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
