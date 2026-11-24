import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * The questions on a posting's form, and the application itself.
 *
 * Its own route rather than the generic proxy, which refuses a call with no session — and the
 * caller here is a stranger on a public page who has no session by definition. No token is
 * forwarded: the API endpoints behind this are anonymous and do their own checking, down to
 * whether the page is published.
 *
 * Nothing in the path is trusted. The slug and the posting id are passed on encoded, and the
 * body is forwarded as it arrived for the API to validate; this file decides nothing.
 */
function target(slug: string, jobId: string, leaf: string): string {
  return `/api/public/companies/${encodeURIComponent(slug)}/offres/${encodeURIComponent(jobId)}/${leaf}`;
}

// Response, not NextResponse: an unreachable API is relayed back exactly as api-server
// built it, carrying the header the client reads to tell an outage from a refusal.
async function relay(response: Response): Promise<Response> {
  if (isUnreachable(response)) return response;

  const text = await response.text();

  return new NextResponse(text || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; jobId: string }> },
) {
  const { slug, jobId } = await params;
  return relay(await apiFetch(target(slug, jobId, "formulaire")));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; jobId: string }> },
) {
  const { slug, jobId } = await params;
  const body = await request.text();

  return relay(
    await apiFetch(target(slug, jobId, "candidature"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}
