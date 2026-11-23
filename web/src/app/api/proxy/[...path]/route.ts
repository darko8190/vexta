import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { apiFetch, isUnreachable } from "@/lib/api-server";

/**
 * How long this call is allowed to take, in milliseconds. Undefined keeps the ten seconds that
 * are right for the hundreds of ordinary calls — long enough for a slow query, short enough
 * that a dead API reads as an outage rather than as a page that never loads.
 *
 * The two exceptions are the calls that are slow by nature rather than by accident: a model
 * thinking and calling back into the application, and a workbook of several thousand rows being
 * read or written. Cutting those off at ten seconds would make them look broken.
 */
function deadlineFor(path: string): number | undefined {
  if (path.startsWith("assistant/message")) return 180_000;
  if (path.startsWith("import-export/")) return 120_000;
  return undefined;
}

async function forward(request: NextRequest, segments: string[]) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  const targetPath = segments.join("/");
  const search = request.nextUrl.search;

  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);

  // A file upload is multipart, and multipart only works if the boundary in the header matches
  // the one in the body. Reading it as text and re-labelling it JSON — which is right for every
  // other call — hands the API a body it cannot parse, so the bytes and the original header are
  // passed through untouched instead.
  const incomingType = request.headers.get("content-type") ?? "";
  const isMultipart = incomingType.startsWith("multipart/form-data");

  const body = hasBody
    ? isMultipart
      ? await request.arrayBuffer()
      : await request.text()
    : undefined;

  const timeoutMs = deadlineFor(targetPath);

  const response = await apiFetch(`/api/${targetPath}${search}`, {
    ...(timeoutMs ? { timeoutMs } : {}),
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": isMultipart ? incomingType : "application/json" } : {}),
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
