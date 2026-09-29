import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key || key === "rk_test_replace_me") return NextResponse.json({ error: "Stripe key is missing." }, { status: 503 });
  if (request.nextUrl.searchParams.get("resource") !== "products") return NextResponse.json({ error: "Unsupported option type." }, { status: 400 });
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 3) return NextResponse.json({ data: [] });
  const url = new URL("https://api.stripe.com/v1/products/search");
  url.searchParams.set("limit", "100");
  url.searchParams.set("query", `name~"${query.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
  try {
    const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json({ error: payload?.error?.message ?? "Product search failed." }, { status: response.status });
    return NextResponse.json({ data: (payload.data ?? []).map((item: { id: string; name: string; active: boolean }) => ({ id: item.id, name: item.name, active: item.active })) });
  } catch {
    return NextResponse.json({ error: "Could not reach Stripe." }, { status: 502 });
  }
}
