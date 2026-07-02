import { scanOpenings, persistOpenings, type ScanScope } from "@/lib/opening-scan";

// Web-scan for newly opened / soon-to-open UK restaurants using Claude's
// server-side web_search tool.
//   POST  — manual "Scan now" from the New openings page. Respects the caller's
//           scope (london | uk) and returns openings for the client to apply
//           through the store (which shares them to Supabase when configured).
//   GET   — Vercel Cron (every 6h, see vercel.json). Scans UK-wide and persists
//           straight to shared Supabase state. Protected by CRON_SECRET.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual scans keep the higher-quality default model; the background cron uses
// the cheaper OPENINGS_SCAN_MODEL (Haiku) baked into scanOpenings.
const MANUAL_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unprotected until a secret is set (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "no_api_key" });
  }

  let scope: ScanScope = "uk";
  let area: string | undefined;
  try {
    const body = await req.json();
    if (body?.scope === "london" || body?.scope === "uk") scope = body.scope;
    area = body?.area ? String(body.area) : undefined;
  } catch {
    /* no body is fine */
  }

  try {
    const openings = await scanOpenings({ scope, area, model: MANUAL_MODEL });
    return Response.json({ openings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: "api_error", message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "no_api_key" });
  }

  try {
    // Cron always scans UK-wide; London-only viewers are filtered client-side.
    const openings = await scanOpenings({ scope: "uk" });
    const { added, updated } = await persistOpenings(openings);
    console.log("[openings-scan]", JSON.stringify({ found: openings.length, added, updated }));
    return Response.json({ ok: true, found: openings.length, added, updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[openings-scan] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
