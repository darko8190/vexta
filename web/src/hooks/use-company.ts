import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CompanyProfile } from "@/lib/types";

export interface SaveCompanyValues {
  name: string;
  description: string | null;
  contactEmail: string | null;
  phone: string | null;
  /** #RRGGBB, or null to go back to Vexta's blue. */
  brandColor: string | null;
}

export function useCompanyProfileQuery() {
  return useQuery({
    queryKey: ["company", "profile"],
    queryFn: () => api.get<CompanyProfile>("company/profile"),
  });
}

export function useSaveCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveCompanyValues) => api.put<CompanyProfile>("company/profile", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }),
  });
}

/**
 * FileReader rather than spreading the bytes into String.fromCharCode: a 2 MB logo is two
 * million arguments, which overflows the call stack.
 */
async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  // An SVG has no intrinsic pixel size worth reading, and decoding one only to measure it is
  // work for nothing.
  if (file.type === "image/svg+xml") return { width: 0, height: 0 };

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const [content, dimensions] = await Promise.all([toBase64(file), readDimensions(file)]);
      return api.put<{ eTag: string }>("company/logo", {
        contentType: file.type,
        content,
        width: dimensions.width,
        height: dimensions.height,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }),
  });
}

export function useDeleteCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("company/logo"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }),
  });
}
