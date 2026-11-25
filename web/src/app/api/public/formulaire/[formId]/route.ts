import { NextRequest, NextResponse } from "next/server";
import { apiFetch, isUnreachable } from "@/lib/api-server";
import { getToken } from "@/lib/session";

/**
 * A form reached by its own link (/f/{id}), and the filled copy going back.
 *
 * The twin of ../formulaires/[slug]/[formId], without the company's page in the path: the API
 * finds the company from the form. Same reasons for being its own route — the generic proxy
 * refuses a call with no session — and the same rule that nothing here is trusted or decided.
 */
function target(formId: string): string {
  return `/api/public/formulaires/${encodeURIComponent(formId)}`;
}

async function relay(response: Response): Promise<Response> {
  if (isUnreachable(response)) return response;

  const text = await response.text();

  return new NextResponse(text || null, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  // The e-mailed link's token, passed on as it came; the API checks it.
  const token = request.nextUrl.searchParams.get("jeton");
  return relay(await apiFetch(`${target(formId)}${token ? `?jeton=${encodeURIComponent(token)}` : ""}`));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const body = await request.text();
  const token = await getToken();

  return relay(
    await apiFetch(target(formId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    }),
  );
}
