import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BrandingSlot, BrandingSlotInfo } from "@/lib/types";

export const BRANDING_MAX_BYTES = 2 * 1024 * 1024;

export const BRANDING_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon";

export function useBrandingQuery() {
  return useQuery({
    queryKey: ["branding"],
    queryFn: () => api.get<BrandingSlotInfo[]>("branding"),
  });
}

interface UploadBrandingInput {
  slot: BrandingSlot;
  file: File;
}

export function useUploadBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slot, file }: UploadBrandingInput) => {
      const { content, width, height } = await readImage(file);

      await api.put<void>(`admin/branding/${slot}`, {
        contentType: file.type,
        content,
        width,
        height,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branding"] }),
  });
}

export function useResetBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slot: BrandingSlot) => api.delete<void>(`admin/branding/${slot}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branding"] }),
  });
}

/**
 * The file as base64, with the size the browser measured.
 *
 * base64 via FileReader rather than btoa(String.fromCharCode(...bytes)): spreading a two
 * megabyte array into a function call overflows the argument stack and throws.
 */
async function readImage(file: File): Promise<{ content: string; width: number; height: number }> {
  const [content, size] = await Promise.all([toBase64(file), measure(file)]);
  return { content, ...size };
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.onload = () => {
      const result = String(reader.result);
      // "data:image/png;base64,AAAA..." — the API wants only what follows the comma.
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Measured here because the API has no image library, and would need one only for this. An SVG
 * without intrinsic dimensions legitimately measures 0, which the API accepts.
 */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    const done = (width: number, height: number) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };

    image.onload = () => done(image.naturalWidth, image.naturalHeight);
    image.onerror = () => done(0, 0);
    image.src = url;
  });
}
