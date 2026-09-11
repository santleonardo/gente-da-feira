import { NextRequest, NextResponse } from "next/server";

/**
 * Recebe beacons de Web Vitals (sendBeacon / fetch keepalive).
 * Em produção, encaminhe para analytics (Vercel Analytics, GA4, Datadog…).
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: unknown;

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[web-vitals]", payload);
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
