import { cacheLife, cacheTag } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { PublicModule, PublicPlan } from "@/lib/types";

/** Purged by /api/catalog/revalidate whenever the super admin changes the catalogue. */
export const CATALOG_TAG = "catalog";

/**
 * Five minutes, even though every change purges the tag explicitly.
 *
 * The expiry is the safety net, not the mechanism. These functions return an empty list when the
 * API cannot be reached, and that answer gets cached like any other — including during the
 * production build, where no API is running at all. Without an expiry the image would ship a
 * permanently empty pricing section. With one, a bad entry heals itself within five minutes.
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
 * An empty list on any failure is deliberate: a marketing page that renders without its prices
 * is better than one that fails to render at all.
 */
async function readJson<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path, { timeoutMs: 2_500, inheritCache: true });
  if (!response.ok) return [];

  try {
    return (await response.json()) as T[];
  } catch {
    return [];
  }
}
