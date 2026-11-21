import { cacheLife } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Serves the platform's logo and icon.
 *
 * Three layers, in order: what the super admin uploaded, then the URL configured in the
 * environment, then the artwork bundled with the front end. The last one is why this never
 * renders a broken image — a brand-new deployment with nothing configured still shows a logo.
 *
 * It is proxied rather than pointed straight at the API because the API is not reachable from
 * the browser in production: only this Next server is.
 */
const SLOTS = {
  "logo-light": { envName: "BRANDING_LOGO_LIGHT_URL", bundled: "/vexta-logo-light.png" },
  "logo-dark": { envName: "BRANDING_LOGO_DARK_URL", bundled: "/vexta-logo-dark.png" },
  icon: { envName: "BRANDING_ICON_URL", bundled: "/vexta-icon.png" },
} as const;

type Slot = keyof typeof SLOTS;

function isSlot(value: string): value is Slot {
  return Object.hasOwn(SLOTS, value);
}

/** Matches the minute promised when an image is saved. */
const CACHE_SECONDS = 60;

/**
 * The environment's URL for this slot, or the bundled artwork.
 *
 * The blank check is not defensive padding. Compose writes `${BRANDING_ICON_URL:-}` as an empty
 * string rather than leaving the variable out, and `??` does not treat "" as absent — so an
 * unconfigured slot would resolve to the empty URL, which is the site root.
 */
function fallbackFor(slot: Slot): string {
  const configured = process.env[SLOTS[slot].envName];
  return configured && configured.trim().length > 0 ? configured.trim() : SLOTS[slot].bundled;
}

/**
 * Which slots actually hold an upload, cached for the whole server.
 *
 * This exists for speed. Every page renders three brand images, and without it each one asked
 * the API — so a deployment that has uploaded nothing, which is the normal case, paid six round
 * trips per page load to be told three times that there is nothing to serve.
 */
async function uploadedSlots(): Promise<Set<string>> {
  "use cache";
  cacheLife({ stale: CACHE_SECONDS, revalidate: CACHE_SECONDS, expire: 300 });

  const response = await apiFetch("/api/branding", { timeoutMs: 3_000, inheritCache: true });
  if (!response.ok) return new Set();

  try {
    const slots = (await response.json()) as { slot: string; isUploaded: boolean }[];
    return new Set(slots.filter((entry) => entry.isUploaded).map((entry) => entry.slot));
  } catch {
    // An unreadable manifest means "nothing uploaded", which falls back to artwork that works.
    return new Set();
  }
}

/**
 * A relative Location is deliberate for the bundled file. Resolving it here would mean knowing
 * the public origin, and the server only knows the address it binds to inside the container —
 * redirecting the browser to http://0.0.0.0:3000 sends it nowhere. Browsers resolve a relative
 * Location against the request URL, which is the public one.
 *
 * The redirect is cached as hard as the image it stands in for, or the browser would ask again
 * on every single page view.
 */
function redirectTo(target: string) {
  return new NextResponse(null, {
    status: 307,
    headers: {
      location: target,
      "cache-control": `public, max-age=${CACHE_SECONDS}, must-revalidate`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slot: string }> },
) {
  const { slot } = await params;

  if (!isSlot(slot)) {
    return new NextResponse(null, { status: 404 });
  }

  // Nothing uploaded for this slot: answered without touching the API at all.
  if (!(await uploadedSlots()).has(slot)) {
    return redirectTo(fallbackFor(slot));
  }

  // Forwarded so an unchanged logo costs a 304 and no bytes, despite the short max-age that
  // makes a newly uploaded one appear within the minute.
  const ifNoneMatch = request.headers.get("if-none-match");

  const response = await apiFetch(`/api/branding/${slot}`, {
    timeoutMs: 3_000,
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
  });

  if (response.status === 304) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders(response) });
  }

  // Unreachable, or deleted since the manifest was cached.
  if (isUnreachable(response) || !response.ok) {
    return redirectTo(fallbackFor(slot));
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") ?? "image/png",
      // An uploaded SVG could otherwise run script as if it were our own code.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      ...cacheHeaders(response),
    },
  });
}

function cacheHeaders(response: Response): Record<string, string> {
  const etag = response.headers.get("etag");

  return {
    "cache-control": `public, max-age=${CACHE_SECONDS}, must-revalidate`,
    ...(etag ? { etag } : {}),
  };
}
