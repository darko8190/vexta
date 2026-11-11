import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(`${apiBaseUrl()}/api/auth/register-tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Erreur lors de l'inscription." }, { status: response.status });
  }

  return NextResponse.json(data);
}
