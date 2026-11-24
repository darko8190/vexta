import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";
import { getToken } from "@/lib/session";

/**
 * The questions on one of a company's public forms, and the filled copy going back.
 *
 * Its own route rather than the generic proxy, which refuses a call with no session — and the
 * caller here is usually a stranger on a public page with no session. The API endpoints behind
 * this are anonymous and do their own checking, down to whether the page shows forms at all,
 * and they hold the only ceiling on how often a stranger may file one.
 *
 * The visitor's session is passed along when they have one, and only on the way in. Some forms
 * file what they send on the visitor's own customer record — an asset, a request for a quote —
 * and the account is the only trustworthy answer to whose record that is.
 *
 * Nothing in the path is trusted. The slug and the form id are passed on encoded, and the body
 * is forwarded as it arrived for the API to validate; this file decides nothing.
 */
function target(slug: string, formId: string): string {
  return `/api/public/companies/${encodeURIComponent(slug)}/formulaires/${encodeURIComponent(formId)}`;
}

// Response, not NextResponse, when the API is unreachable: that one is relayed back exactly as
// api-server built it, carrying the header the client reads to tell an outage from a refusal.
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
  { params }: { params: Promise<{ slug: string; formId: string }> },
) {
  const { slug, formId } = await params;
  return relay(await apiFetch(target(slug, formId)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; formId: string }> },
) {
  const { slug, formId } = await params;
  const body = await request.text();
  const token = await getToken();

  return relay(
    await apiFetch(target(slug, formId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    }),
  );
}
