import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, setToken } from "@/lib/session";

const ACCESS_TOKEN_SECONDS = 60 * 60 * 12;

export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(`${apiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Erreur de connexion." }, { status: response.status });
  }

  await setToken(data.accessToken, ACCESS_TOKEN_SECONDS);
  return NextResponse.json({ user: data.user });
}
