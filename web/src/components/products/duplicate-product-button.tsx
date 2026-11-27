"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCanManage } from "@/hooks/use-can-create";
import { api, ApiError } from "@/lib/api";
import type { ProductRecord } from "@/lib/types";

/** A copy to start the next product from: the same filing, prices and pictures, no stock. */
export function DuplicateProductButton({ productId, size = "sm" }: { productId: string; size?: "sm" | "icon-sm" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const duplicate = useMutation({
    mutationFn: () => api.post<ProductRecord>(`products/${productId}/dupliquer`),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produit dupliqué.", { description: "Changez son nom et son code, puis enregistrez." });
      router.push(`/inventaire/produits/${copy.id}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible de dupliquer le produit."),
  });
  if (!canManage) return null;
  return size === "icon-sm" ? (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Dupliquer le produit"
      title="Dupliquer le produit"
      disabled={duplicate.isPending}
      onClick={(event) => {
        event.stopPropagation();
        duplicate.mutate();
      }}
    >
      {duplicate.isPending ? <Spinner /> : <Copy />}
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
      {duplicate.isPending ? <Spinner /> : <Copy />}
      Dupliquer
    </Button>
  );
}
