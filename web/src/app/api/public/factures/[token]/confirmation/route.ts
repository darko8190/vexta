import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * Records the payment on the way back from Stripe, so the page says "payé" without waiting for
 * the webhook.
 *
 * The session id in the body is forwarded as it arrived. It proves nothing on its own: the API
 * asks Stripe whether that session is finished, paid, and on this company's account.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.text();

  const response = await apiFetch(`/api/public/factures/${encodeURIComponent(token)}/confirmation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (isUnreachable(response)) return response;

  const text = await response.text();

  return new NextResponse(text || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
