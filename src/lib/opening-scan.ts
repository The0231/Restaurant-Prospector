// Server-only web scan for new restaurant openings + shared persistence.
//
// Shared by the manual scan (POST /api/scan-openings, which returns openings for
// the client to apply through the store) and the scheduled cron (GET, which has
// no browser so it persists straight to the shared Supabase state via
// persistOpenings). Keeps the Anthropic/web-search logic in one place.

import Anthropic from "@anthropic-ai/sdk";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase";
import { loadBaseVenues } from "./base-dataset";
import { prepareOpenings, type ScannedOpening } from "./openings";
import type { Restaurant } from "./types";

const ADDED = "ltp_added";
const OVERRIDES = "ltp_overrides";

// Model for the automatic/background scan (cheap + fast). Manual scans pass
// their own model in. Overridable via env.
const AUTO_MODEL = process.env.OPENINGS_SCAN_MODEL || "claude-haiku-4-5";

export type ScanScope = "london" | "uk";

function buildPrompt(scope: ScanScope, area?: string): string {
  if (scope === "uk") {
    const where = area
      ? `in/around ${area}`
      : "across the United Kingdom (all major cities and towns — London, Manchester, Birmingham, Leeds, Liverpool, Bristol, Newcastle, Glasgow, Edinburgh, Cardiff, and beyond)";
    return `Search the web for RESTAURANTS that have recently opened, or are opening soon, ${where} (focus on the last ~8 weeks and upcoming openings). Use reputable UK food/opening sources such as Big Hospitality, The Caterer, SquareMeal, Eater London, Hot Dinners, Time Out (city editions), The Infatuation, and regional guides (e.g. Manchester's Finest, Confidentials, Bristol24/7).

Return ONLY a JSON array (no prose, no markdown fences) of up to 15 objects, each with exactly these keys:
- "name": the restaurant name
- "city": the UK city or town (e.g. "London", "Manchester", "Bristol")
- "area": the neighbourhood/district within that city (e.g. "Soho", "Ancoats", "Clifton")
- "cuisine": best guess of cuisine (e.g. "Italian", "Modern European", "Japanese / Sushi")
- "openingDate": approximate, e.g. "opened June 2026" or "opening July 2026"
- "evidence": one short phrase citing the source, e.g. "Big Hospitality, Jun 2026"
- "url": the source article URL if available, else ""

Only include genuine, specific restaurants you found evidence for. If you cannot find any, return [].`;
  }

  // London-only.
  const where = area ? `in/around ${area}, London` : "across London";
  return `Search the web for RESTAURANTS that have recently opened, or are opening soon, ${where} (focus on the last ~8 weeks and upcoming openings). Use reputable London food/opening sources such as Hot Dinners, Eater London, SquareMeal, Time Out London, The Infatuation, and CODE Hospitality.

Return ONLY a JSON array (no prose, no markdown fences) of up to 12 objects, each with exactly these keys:
- "name": the restaurant name
- "area": the London neighbourhood or borough (e.g. "Soho", "Shoreditch", "Borough")
- "cuisine": best guess of cuisine (e.g. "Italian", "Modern European", "Japanese / Sushi")
- "openingDate": approximate, e.g. "opened June 2026" or "opening July 2026"
- "evidence": one short phrase citing the source, e.g. "Eater London new-openings, Jun 2026"
- "url": the source article URL if available, else ""

Only include genuine, specific restaurants you found evidence for. If you cannot find any, return [].`;
}

function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  // 1) whole text is JSON
  try {
    const whole = JSON.parse(text.trim());
    if (Array.isArray(whole)) return whole;
  } catch {
    /* fall through */
  }
  // 2) fenced ```json block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const inner = JSON.parse(fence[1].trim());
      if (Array.isArray(inner)) return inner;
    } catch {
      /* fall through */
    }
  }
  // 3) first '[' to last ']'
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const sliced = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(sliced)) return sliced;
    } catch {
      /* fall through */
    }
  }
  return [];
}

// Run Claude's server-side web_search tool and return the parsed openings array.
export async function scanOpenings(opts: { scope: ScanScope; area?: string; model?: string }): Promise<ScannedOpening[]> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(opts.scope, opts.area) }];

  let best: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    const params = {
      model: opts.model || AUTO_MODEL,
      max_tokens: 2048,
      // Basic web search variant — works across all models (incl. Haiku).
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const response = await client.messages.create(params);

    const textNow = response.content
      .filter((b) => b.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join("\n");
    const parsed = extractJsonArray(textNow);
    if (parsed.length > best.length) best = parsed; // keep the richest array seen

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue; // resume the server-tool loop
    }
    break;
  }

  return best as ScannedOpening[];
}

// Build a lightweight "existing venues" list for de-duplication: base FSA
// dataset (from disk) + added venues, with overrides folded on so a
// dismissed-as-new venue is respected. prepareOpenings only reads name/id/
// website/openingStatus/dismissedAsNew, so partial rows are enough.
async function buildExisting(): Promise<Restaurant[]> {
  const existing: Partial<Restaurant>[] = [];

  try {
    const venues = await loadBaseVenues();
    for (const v of venues) existing.push({ id: v.id, name: v.name });
  } catch {
    /* base dataset optional — name-dedup just won't cover FSA venues */
  }

  try {
    const sb = supabaseAdmin();
    const [addedRes, ovRes] = await Promise.all([
      sb.from(ADDED).select("id,data"),
      sb.from(OVERRIDES).select("id,patch"),
    ]);
    for (const r of addedRes.data ?? []) {
      const d = r.data as Restaurant;
      existing.push({
        id: d.id,
        name: d.name,
        website: d.website,
        openingStatus: d.openingStatus,
        dismissedAsNew: d.dismissedAsNew,
      });
    }
    const ovMap = new Map<string, Partial<Restaurant>>();
    for (const r of ovRes.data ?? []) ovMap.set(r.id as string, r.patch as Partial<Restaurant>);
    if (ovMap.size) {
      for (const e of existing) {
        const ov = e.id ? ovMap.get(e.id) : undefined;
        if (ov) Object.assign(e, ov); // dismissedAsNew / openingStatus from overrides win
      }
    }
  } catch {
    /* added/overrides optional */
  }

  return existing as Restaurant[];
}

// Persist scanned openings to the shared Supabase state (additive, non-clobbering).
// Mirrors the merge logic in /api/data. No-op when Supabase isn't configured.
export async function persistOpenings(found: ScannedOpening[]): Promise<{ added: number; updated: number }> {
  if (!isSupabaseConfigured()) return { added: 0, updated: 0 };

  const existing = await buildExisting();
  const { toAdd, toUpdate } = prepareOpenings(found, existing);
  const sb = supabaseAdmin();

  if (toAdd.length) {
    const rows = toAdd.map((it) => ({ id: it.id, data: it }));
    const { error } = await sb.from(ADDED).upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  const ids = Object.keys(toUpdate);
  if (ids.length) {
    const [addedRes, ovRes] = await Promise.all([
      sb.from(ADDED).select("id,data").in("id", ids),
      sb.from(OVERRIDES).select("id,patch").in("id", ids),
    ]);
    if (addedRes.error) throw addedRes.error;
    if (ovRes.error) throw ovRes.error;
    const addedMap = new Map((addedRes.data ?? []).map((r) => [r.id as string, r.data as Restaurant]));
    const ovMap = new Map((ovRes.data ?? []).map((r) => [r.id as string, r.patch as Partial<Restaurant>]));

    const addedUpserts: { id: string; data: Restaurant }[] = [];
    const ovUpserts: { id: string; patch: Partial<Restaurant> }[] = [];
    for (const id of ids) {
      const patch = toUpdate[id];
      if (addedMap.has(id)) {
        addedUpserts.push({ id, data: { ...(addedMap.get(id) as Restaurant), ...patch } });
      } else {
        ovUpserts.push({ id, patch: { ...(ovMap.get(id) ?? {}), ...patch } });
      }
    }
    const ops = [];
    if (addedUpserts.length) ops.push(sb.from(ADDED).upsert(addedUpserts, { onConflict: "id" }));
    if (ovUpserts.length) ops.push(sb.from(OVERRIDES).upsert(ovUpserts, { onConflict: "id" }));
    const results = await Promise.all(ops);
    for (const r of results) if (r.error) throw r.error;
  }

  return { added: toAdd.length, updated: ids.length };
}
