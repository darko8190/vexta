import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, getToken, setToken } from "@/lib/session";

const ACCESS_TOKEN_SECONDS = 60 * 60 * 12;

async function swapToken(path: string) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: "Non authentifié." }, { status: 401 });
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(data ?? { message: "Action impossible." }, { status: response.status });
  }

  await setToken(data.accessToken, ACCESS_TOKEN_SECONDS);
  return NextResponse.json({ user: data.user });
}

export async function POST(request: NextRequest) {
  const { tenantId } = await request.json();
  if (!tenantId) {
    return NextResponse.json({ message: "Locataire manquant." }, { status: 400 });
  }

  return swapToken(`/api/admin/tenants/${tenantId}/impersonate`);
}

export async function DELETE() {
  return swapToken("/api/admin/tenants/exit-impersonation");
}
