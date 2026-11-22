import { NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Its own route rather than the generic proxy, which reads every response with `.text()`.
 * That is right for JSON and wrong for an image: decoding PNG bytes as text and re-encoding
 * them corrupts the file, which shows up as a broken image and nothing else.
 *
 * The API endpoint is anonymous — a logo is a public mark — so no token is forwarded.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  const response = await apiFetch(`/api/company/${encodeURIComponent(tenantId)}/logo`);
  if (isUnreachable(response)) return response;

  if (!response.ok) {
    return NextResponse.json({ message: "Logo introuvable." }, { status: response.status });
  }

  const bytes = await response.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      // The URL carries the ETag as a cache buster, so a stored copy is always the right one.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
