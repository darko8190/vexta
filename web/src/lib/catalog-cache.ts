import { cacheLife, cacheTag } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { PublicModule, PublicPlan } from "@/lib/types";

/** Purged by /api/catalog/revalidate whenever the super admin changes the catalogue. */
export const CATALOG_TAG = "catalog";

/**
 * Five minutes, even though every change purges the tag explicitly. The expiry is a safety net
 * for a purge that never arrived, not the mechanism.
 */
const CATALOG_CACHE = { stale: 300, revalidate: 300, expire: 3600 } as const;

/**
 * The published catalogue, as a visitor sees it.
 *
 * "use cache" is what makes the marketing page prerenderable: under Cache Components an
 * uncached fetch in a page body is a build error, not a slow page.
 */
export async function getPublishedModules(): Promise<PublicModule[]> {
  "use cache";
  cacheLife(CATALOG_CACHE);
  cacheTag(CATALOG_TAG);

  return readJson<PublicModule>("/api/modules");
}

export async function getPublishedPlans(): Promise<PublicPlan[]> {
  "use cache";
  cacheLife(CATALOG_CACHE);
  cacheTag(CATALOG_TAG);

  return readJson<PublicPlan>("/api/plans");
}

/**
 * Throws rather than returning an empty list. A "use cache" function that returns stores its
 * answer; one that throws stores nothing. An empty list here used to be cached as the
 * catalogue — at build time, with no API running, and then for every visitor after the deploy.
 * The page catches the error and shows the section empty for that one request.
 */
async function readJson<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path, { timeoutMs: 2_500, inheritCache: true });
  if (!response.ok) throw new Error(`Catalogue indisponible (${path}: ${response.status}).`);

  return (await response.json()) as T[];
}
