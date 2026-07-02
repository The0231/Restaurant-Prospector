import { NextResponse } from "next/server";
import { runCustomerSync } from "@/lib/customer-sync";

// Nightly customer sync from Power BI → shared Supabase state.
// Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET: Vercel
// sends it as `Authorization: Bearer <CRON_SECRET>` when the env var is set.
// Reads the FSA dataset from disk and parses ~tens of MB, so run on Node with a
// generous timeout, never cached.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unprotected until a secret is set (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runCustomerSync();
    console.log("[powerbi-sync]", JSON.stringify({ ...summary, unmatched: summary.unmatched.length }));
    const status = summary.ok ? 200 : summary.configured ? 500 : 200;
    return NextResponse.json(
      {
        ok: summary.ok,
        configured: summary.configured,
        fetched: summary.fetched,
        matched: summary.matched,
        flagged: summary.flagged,
        unmatchedCount: summary.unmatched.length,
        unmatchedSample: summary.unmatched.slice(0, 50),
        error: summary.error,
      },
      { status }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[powerbi-sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle; // Vercel Cron issues GET
export const POST = handle; // allow manual trigger via curl
