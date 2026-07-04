import { NextRequest, NextResponse } from "next/server";

/**
 * SEC-012: CSP Violation Report Endpoint
 *
 * Receives Content-Security-Policy violation reports from the browser.
 * This endpoint is intentionally simple — it logs violations for
 * debugging and returns 204 to avoid leaking information.
 *
 * The middleware allows this route without authentication.
 * Rate limiting is handled by the browser's built-in throttling
 * of report-uri reports (max 1 report per violation per page load).
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log violation for debugging (structured JSON for log aggregation)
    console.warn(
      "[CSP-VIOLATION]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        violatedDirective: body["violated-directive"] || "unknown",
        documentURI: body["document-uri"] || "unknown",
        sourceFile: body["source-file"] || null,
        lineNumber: body["line-number"] || null,
        blockedURI: body["blocked-uri"] || null,
        disposition: body["disposition"] || "enforce",
      })
    );
  } catch {
    // Malformed report body — ignore silently
  }

  // 204 No Content — no information leaked
  return new NextResponse(null, { status: 204 });
}

// Some browsers send reports via GET with csp-report query param
export async function GET() {
  return new NextResponse(null, { status: 204 });
}