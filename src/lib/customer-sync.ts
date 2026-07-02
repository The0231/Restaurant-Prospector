// Customer sync (server-only): pull the customer list from Power BI, match each
// row to an FSA venue by normalised name + postcode, and flag matches as
// existing customers in the shared Supabase state so the whole team sees them.
//
// This is ADDITIVE: it only ever sets existingCustomer = true. It never removes
// the flag, so a customer dropping out of Power BI (or a manual flag) is left
// untouched — flip POWERBI_SYNC_PRUNE handling in here later if you want that.

import { isSupabaseConfigured, supabaseAdmin } from "./supabase";
import { loadBaseVenues } from "./base-dataset";
import { fetchPowerBICustomers, isPowerBIConfigured, type PowerBICustomer } from "./powerbi";

const OVERRIDES = "ltp_overrides";
const ADDED = "ltp_added";

interface VenueLite {
  id: string;
  normName: string;
}

export interface SyncSummary {
  ok: boolean;
  configured: boolean;
  fetched: number;
  matched: number;
  flagged: number;
  unmatched: { name: string; postcode: string }[];
  error?: string;
}

function normPostcode(s: string): string {
  return (s || "").toUpperCase().replace(/\s+/g, "").trim();
}

function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|ltd|limited|plc|llp|llc|inc|co|uk)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Best match within one postcode: exact normalised name > substring > token
// overlap. Postcode-scoping keeps false positives near zero across the UK set.
function matchVenue(nn: string, candidates: VenueLite[]): VenueLite | null {
  let best: VenueLite | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    let score = 0;
    if (c.normName === nn) {
      score = 1;
    } else if (nn.length >= 4 && (c.normName.includes(nn) || nn.includes(c.normName))) {
      score = 0.8;
    } else {
      const a = Array.from(new Set(nn.split(" ").filter(Boolean)));
      const b = Array.from(new Set(c.normName.split(" ").filter(Boolean)));
      if (a.length && b.length) {
        const bset = new Set(b);
        let inter = 0;
        for (const t of a) if (bset.has(t)) inter++;
        const jaccard = inter / (a.length + b.length - inter);
        if (jaccard >= 0.6) score = 0.5 + jaccard * 0.25;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}

async function buildVenueIndex(): Promise<Map<string, VenueLite[]>> {
  const map = new Map<string, VenueLite[]>();
  const add = (id: string, name: string, postcode: string) => {
    const np = normPostcode(postcode);
    const nn = normName(name);
    if (!np || !id || !nn) return;
    const entry = { id, normName: nn };
    const arr = map.get(np);
    if (arr) arr.push(entry);
    else map.set(np, [entry]);
  };

  // Base FSA dataset (Supabase Storage in prod, bundled file locally).
  const venues = await loadBaseVenues();
  for (const v of venues) add(v.id, v.name, v.postcode ?? "");

  // Manually-added venues from the shared DB, so they can match too.
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from(ADDED).select("id,data");
    for (const r of data ?? []) {
      const d = r.data as { id?: string; name?: string; postcode?: string } | null;
      if (d) add(d.id ?? (r.id as string), d.name ?? "", d.postcode ?? "");
    }
  } catch {
    /* added venues are optional — base dataset is enough to match against */
  }

  return map;
}

// Build the extra patch fields for the mobile "Contact info" panel from
// whichever Power BI contact columns are configured. Blank/missing fields are
// omitted (not written as empty strings) so a column that goes blank in Power
// BI doesn't clobber a previously-synced value — same additive philosophy as
// existingCustomer.
function contactPatch(c: PowerBICustomer | undefined): Record<string, unknown> {
  if (!c) return {};
  const patch: Record<string, unknown> = {};
  if (c.contactName) patch.customerContactName = c.contactName;
  if (c.phone) patch.customerContactPhone = c.phone;
  if (c.email) patch.customerContactEmail = c.email;
  if (c.accountManager) patch.customerAccountManager = c.accountManager;
  return patch;
}

async function flagCustomers(ids: string[], contactById: Map<string, PowerBICustomer>): Promise<number> {
  if (!ids.length) return 0;
  const sb = supabaseAdmin();
  let flagged = 0;
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    // Merge with any existing override so we don't clobber other fields.
    const { data: existing, error: selErr } = await sb.from(OVERRIDES).select("id,patch").in("id", batch);
    if (selErr) throw selErr;
    const exMap = new Map((existing ?? []).map((r) => [r.id as string, r.patch as Record<string, unknown>]));
    const rows = batch.map((id) => ({
      id,
      patch: { ...(exMap.get(id) ?? {}), existingCustomer: true, ...contactPatch(contactById.get(id)) },
    }));
    const { error } = await sb.from(OVERRIDES).upsert(rows, { onConflict: "id" });
    if (error) throw error;
    flagged += rows.length;
  }
  return flagged;
}

export async function runCustomerSync(): Promise<SyncSummary> {
  const empty = { fetched: 0, matched: 0, flagged: 0, unmatched: [] as { name: string; postcode: string }[] };
  if (!isPowerBIConfigured()) {
    return { ok: false, configured: false, ...empty, error: "Power BI env vars are not set" };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, ...empty, error: "Supabase (shared DB) is not configured" };
  }

  const [customers, index] = await Promise.all([fetchPowerBICustomers(), buildVenueIndex()]);

  const matchedIds = new Set<string>();
  const contactById = new Map<string, PowerBICustomer>();
  const unmatched: { name: string; postcode: string }[] = [];
  for (const c of customers) {
    const nn = normName(c.name);
    if (!nn) continue;
    const np = normPostcode(c.postcode);
    const candidates = np ? index.get(np) : undefined;
    const hit = candidates ? matchVenue(nn, candidates) : null;
    if (hit) {
      matchedIds.add(hit.id);
      contactById.set(hit.id, c);
    } else {
      unmatched.push({ name: c.name, postcode: c.postcode });
    }
  }

  const flagged = await flagCustomers(Array.from(matchedIds), contactById);

  return {
    ok: true,
    configured: true,
    fetched: customers.length,
    matched: matchedIds.size,
    flagged,
    unmatched,
  };
}
