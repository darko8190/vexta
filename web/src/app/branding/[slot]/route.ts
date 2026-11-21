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
 * A relative Location is deliberate for the bundled file. Resolving it here would mean knowing
 * the public origin, and the server only knows the address it binds to inside the container —
 * redirecting the browser to http://0.0.0.0:3000 sends it nowhere. Browsers resolve a relative
 * Location against the request URL, which is the public one.
 */
function redirectTo(target: string) {
  return new NextResponse(null, { status: 307, headers: { location: target } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slot: string }> },
) {
  const { slot } = await params;

  if (!isSlot(slot)) {
    return new NextResponse(null, { status: 404 });
  }

  const fallback = fallbackFor(slot);

  // Forwarded so an unchanged logo costs a 304 and no bytes, despite the short max-age that
  // makes a newly uploaded one appear within the minute.
  const ifNoneMatch = request.headers.get("if-none-match");

  const response = await apiFetch(`/api/branding/${slot}`, {
    timeoutMs: 3_000,
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
  });

  if (isUnreachable(response) || response.status === 404) {
    return redirectTo(fallback);
  }

  if (response.status === 304) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders(response) });
  }

  if (!response.ok) {
    return redirectTo(fallback);
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
    "cache-control": "public, max-age=60, must-revalidate",
    ...(etag ? { etag } : {}),
  };
}
