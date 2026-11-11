import { NextResponse } from "next/server";
import { apiBaseUrl, getToken } from "@/lib/session";

export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  const response = await fetch(`${apiBaseUrl()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ message: "Session invalide." }, { status: response.status });
  }

  const user = await response.json();
  return NextResponse.json({ user });
}
