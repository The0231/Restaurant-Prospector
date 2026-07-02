import { NextRequest, NextResponse } from "next/server";
import { buildSalesFilters, getSalesEmbedInfo, isSalesReportConfigured } from "@/lib/powerbi";

// Mints a short-lived Power BI embed token for the mobile "Sales" panel.
// Protected by the app's normal session-cookie middleware (this path is not
// in PUBLIC_PATHS) — only logged-in staff can call it. Reuses the same Entra
// service principal already configured for the nightly customer sync, so no
// per-user Power BI licence or login is required.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isSalesReportConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const postcode = req.nextUrl.searchParams.get("postcode") ?? "";
    const info = await getSalesEmbedInfo();
    const filters = buildSalesFilters(postcode);
    return NextResponse.json({ configured: true, ...info, filters });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
