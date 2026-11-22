import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";

async function forward(request: NextRequest, segments: string[]) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  const targetPath = segments.join("/");
  const search = request.nextUrl.search;

  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  const response = await apiFetch(`/api/${targetPath}${search}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  if (isUnreachable(response)) return response;

  const contentType = response.headers.get("content-type") ?? "application/json";

  // A PDF read as text comes back mangled: the bytes are decoded as UTF-8 and every invalid
  // sequence is replaced, which is most of a PDF. Anything that is not text is passed through
  // as bytes, with the disposition the API chose so the browser still knows what it is.
  if (!contentType.includes("json") && !contentType.startsWith("text/")) {
    const headers = new Headers({ "content-type": contentType });
    const disposition = response.headers.get("content-disposition");
    if (disposition) headers.set("content-disposition", disposition);

    return new NextResponse(await response.arrayBuffer(), { status: response.status, headers });
  }

  const responseText = await response.text();

  return new NextResponse(responseText || null, {
    status: response.status,
    headers: { "content-type": contentType },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}
