import { NextRequest, NextResponse } from "next/server";
import { resources } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key || key === "rk_test_replace_me") {
    return NextResponse.json({ error: "STRIPE_RESTRICTED_KEY is missing. Add it to .env.local and restart the app." }, { status: 503 });
  }

  const resource = resources.find((item) => item.id === request.nextUrl.searchParams.get("resource"));
  if (!resource) return NextResponse.json({ error: "Unknown resource." }, { status: 400 });

  const cursor = request.nextUrl.searchParams.get("cursor");
  const inactivePrices = resource.id === "prices" && Boolean(cursor?.startsWith("inactive:"));
  const stripeCursor = inactivePrices ? cursor?.slice("inactive:".length) : cursor;
  const expanded = request.nextUrl.searchParams.get("expanded") !== "false";
  const url = new URL(`https://api.stripe.com${resource.path}`);
  url.searchParams.set("limit", "100");
  if (stripeCursor) url.searchParams.set("starting_after", stripeCursor);
  if (resource.id === "subscriptions") url.searchParams.set("status", "all");
  if (resource.id === "prices") url.searchParams.set("active", inactivePrices ? "false" : "true");
  for (const field of expanded ? resource.expand ?? [] : []) url.searchParams.append("expand[]", field);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      // Some Stripe accounts/API versions do not allow every expansion. Retry without it.
      if (expanded && resource.expand?.length && response.status === 400 && payload?.error?.param?.includes("expand")) {
        const fallback = new URL(request.url);
        fallback.searchParams.set("expanded", "false");
        return GET(new NextRequest(fallback));
      }
      return NextResponse.json({ error: payload?.error?.message ?? `Stripe returned ${response.status}.` }, { status: response.status });
    }
    const data = Array.isArray(payload.data) ? payload.data : [];
    const switchToInactive = resource.id === "prices" && !inactivePrices && !payload.has_more;
    return NextResponse.json({
      data,
      has_more: Boolean(payload.has_more) || switchToInactive,
      next_cursor: switchToInactive ? "inactive:" : inactivePrices ? `inactive:${data.at(-1)?.id ?? ""}` : data.at(-1)?.id ?? null,
      expanded,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Stripe. Check the key and your connection." }, { status: 502 });
  }
}
