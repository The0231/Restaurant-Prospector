// Weekly data refresh: FSA → score → Google Places enrichment → write JSON.
//
// Run with:  node scripts/fetch-fsa.mjs
//
// Requires GOOGLE_PLACES_API_KEY in .env.local (or set in the environment).
// If the key is absent the script still runs but skips Places enrichment.
//
// What it does:
//   1. Loads existing public/london-restaurants.json to preserve the enrichment
//      cache and detect which venues are genuinely new this run.
//   2. Fetches all Restaurant/Cafe/Canteen FSA establishments in Greater London.
//   3. Diffs by FHRSID — new IDs are flagged with firstSeenDate = today.
//   4. Scores every venue (cuisine fit × price tier).
//   5. Enriches venues with leadScore >= ENRICH_MIN using the Google Places
//      (New) Text Search API — phone, website, confirmed business status, price.
//      Venues enriched within ENRICH_TTL_DAYS days are skipped to limit costs.
//   6. Writes the updated public/london-restaurants.json.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── Config ─────────────────────────────────────────────────────────────────────

const FSA_PAGE_SIZE   = 5000;
const FSA_BIZ_TYPE    = 1;           // Restaurant / Cafe / Canteen
const OUTPUT          = "public/uk-restaurants.json";

// Only call Google Places for venues scoring at or above this threshold.
// Keeps API costs down — no point enriching kebab shops or fast-food chains.
const ENRICH_MIN      = 60;          // out of 100
const ENRICH_TTL_DAYS = 30;          // skip re-enrichment if fresher than this
const PLACES_CONCURRENCY = 8;        // concurrent Places requests (well under QPS limit)

// Google Places (New) endpoints & field mask
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
// nationalPhoneNumber + websiteUri are "Contact" data — billed at ~$40/1000
const PLACES_FIELDS = [
  "places.id",
  "places.displayName",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
  "places.priceLevel",
].join(",");

// ── Load .env.local ────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

// Supabase Storage: where the base dataset is hosted so the app can refresh it
// without a redeploy, and where the enrichment cache persists between CI runs.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.DATASET_BUCKET ?? "datasets";
const OBJECT = "uk-restaurants.json";
const STORAGE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const storageObjectUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT}`;
const storagePublicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT}`;

// ── FSA ────────────────────────────────────────────────────────────────────────

async function getFsaPage(pageNumber) {
  const url =
    `https://api.ratings.food.gov.uk/Establishments?businessTypeId=${FSA_BIZ_TYPE}` +
    `&pageSize=${FSA_PAGE_SIZE}&pageNumber=${pageNumber}`;
  const res = await fetch(url, { headers: { "x-api-version": "2", accept: "application/json" } });
  if (!res.ok) throw new Error(`FSA page ${pageNumber} → HTTP ${res.status}`);
  return res.json();
}

// ── Cuisine / price heuristics ─────────────────────────────────────────────────

function detectCuisine(name) {
  const n = name.toLowerCase();
  const has = (...ks) => ks.some((k) => n.includes(k));
  // Pizza / pasta first — high signal
  if (has("pizz", "forno", "pizza express", "zizzi", "prezzo")) return "Pizza & Pasta";
  // Italian
  if (has("trattor", "osteria", "ristorante", "italian", "cucina", "pasta", "gnocch", "napoli", "naples",
           "milano", "milan", "romano", "amalfi", "toscana", "venezia", "venice", "sicilia", "firenze",
           "sardinia", "puglia", "al dente", "al forno", "la dolce", "la trattoria", "la pasta",
           "la cucina", "la famiglia", "la piazza", "bella italia", "fratelli", "al porto")) return "Italian";
  // Japanese
  if (has("sushi", "sashimi", "japan", "ramen", "katsu", "izakaya", "wasabi", "sakura",
           "teriyaki", "bento", "udon", "tonkotsu", "yakitori", "wagyu", "miso", "omakase",
           "nobu", "matsuri", "zuma", "roka", "kikuchi", "engawa", "kurobuta")) return "Japanese / Sushi";
  // Thai
  if (has("thai", "bangkok", "lemongrass", "siam", "pad thai", "som tam", "khao", "lotus thai")) return "Thai";
  // Chinese
  if (has("chinese", "china", " wok", "noodle", "dim sum", "dumpling", "szechuan", "sichuan",
           "canton", "peking", "oriental", "yum cha", "hot pot", "baozi", "xiao long",
           "hutong", "ping pong", "hakkasan", "yauatcha")) return "Chinese";
  // Indian
  if (has("india", "tandoor", "masala", "curry", "biryani", "bombay", "delhi", "punjab",
           "balti", "tikka", "chutney", "lassi", "dal ", "dosa", "naan", "chai",
           "dishoom", "gymkhana", "benares", "tamarind")) return "Indian";
  // Korean
  if (has("korean", "bibimbap", "kimchi", "pojang", "seoul", "jjigae", "galbi")) return "Other / Unknown";
  // Mexican / Latin
  if (has("mexican", "taco", "burrito", "guacamol", "jalap", "nacho", "fajita", "quesadill",
           "hacienda", "wahaca", "tortilla")) return "Other / Unknown";
  // Burgers
  if (has("burger", "patty", "smash", "shake shack", "five guys", "honest burger",
           "dirty burger", "bleecker")) return "Burgers";
  // Fried chicken
  if (has("fried chicken", "chicken cottage", "perfect fried", "chicken shop", "kfc",
           "popeyes", "nando")) return "Fried chicken";
  // Wings (keep separate from fried chicken shop)
  if (has(" wings") && has("bar", "sports", "american")) return "Fried chicken";
  // Kebab
  if (has("kebab", "shawarma", "doner", "donner", "iskender")) return "Kebab";
  // Greek
  if (has("greek", "souvlaki", "mykonos", "athena", "gyros", "taverna", "hellenic",
           "crete", "athens", "cyprus", "mezedopolio")) return "Greek";
  // Spanish / Tapas
  if (has("tapas", "spanish", "iberica", "tapeo", "catalan", "paella", "bodega",
           "andalucia", "rioja", "pintxo", "basque")) return "Spanish / Tapas";
  // Middle Eastern
  if (has("lebanese", "turkish", "persian", "beirut", "ottoman", "levant", "mezze", "meze",
           "falafel", "anatolia", "kurdish", "arabic", "hummus", "fattoush", "arabian",
           "maroush", "noura", "ranoush", "comptoir libanais")) return "Middle Eastern";
  // Mediterranean (broad)
  if (has("mediterran", "riviera")) return "Mediterranean";
  // French
  if (has("brasserie", "french", "maison", "bistro", "provence", "bordeaux", "lyon",
           "normandy", "alsace", "escargot", "coq au vin", "bouillabaisse", "crepe",
           "le gavroche", "la petite", "le manoir", "boulestin")) return "French";
  // Steakhouse / Grill
  if (has("steak", "grill", "smokehouse", "bbq", "barbecue", "smoked", "hawksmoor",
           "goodman", "maze grill", "chop house", "cut ")) return "Steakhouse";
  // Seafood
  if (has("seafood", "oyster", "fishery", "prawn", "lobster", "crab", "fish market",
           "scott's", "j sheekey", "sheekey", "bentley's", "fishmonger")) return "Seafood";
  // British / Modern British
  if (has("british", "carvery", "sunday roast", "pie & mash", "pie and mash",
           "fish & chips", "fish and chips", "chippy", "chip shop", "rib room",
           "afternoon tea", "claret", "the ivy", "rules restaurant",
           "roast ", " roast", "pudding", "yorkshire")) return "British";
  // Vegan / Plant-based
  if (has("vegan", "plant based", "plant-based", "vegetarian", "veggie")) return "Vegan / Plant-based";
  // Deli / Mediterranean
  if (has("deli", "delicatessen", "larder", "charcuterie", "épicerie")) return "Deli / Mediterranean";
  // Gastro-pub
  if (has("pub", "tavern", " arms", " inn", " tap", "alehouse", "gastropub", "freehouse")) return "Gastro-pub";
  // Cafe / Coffee (check before generic "kitchen" etc.)
  if (has("cafe", "caffe", "coffee", "espresso", "costa", "starbucks", "pret", "barista",
           "bakery", "patisserie", "boulangerie", "croissant", "brunch cafe")) return "Cafe / Coffee";
  // Modern European — fine dining signals with no stronger cuisine match
  if (has("modern european", "fine dining", "tasting menu", "atelier", "chef's table")) return "Modern European";
  // Hotel restaurants are often Modern European
  if (has(" hotel ") || n.startsWith("hotel ")) return "Modern European";
  return "Other / Unknown";
}

const PREMIUM_AREAS = ["W1", "SW1", "SW3", "SW7", "SW10", "W8", "W11", "WC2", "EC2", "EC3", "EC4", "NW3"];

function detectPrice(name, postcode, cuisine) {
  const n = name.toLowerCase();
  const outward = (postcode || "").toUpperCase().split(" ")[0];
  let p = 2;
  if (PREMIUM_AREAS.some((a) => outward.startsWith(a))) p += 1;
  if (/trattor|osteria|ristorante|brasserie|grill|steak|fine dining|members|club/.test(n)) p += 1;
  if (/express|takeaway|take away|kebab|fried chicken|chicken|burger|fast food|cafe|caffe|coffee|snack|chippy|chip shop|food to go|pizza hut|domino|mcdonald|kfc|subway|greggs|pret/.test(n)) p = 1;
  if (cuisine === "Cafe / Coffee") p = Math.min(p, 2);
  return Math.max(1, Math.min(4, p));
}

// ── Lead scoring (mirrors src/lib/mock-data.ts) ────────────────────────────────

const CUISINE_COMPAT = {
  "Italian": 1.0, "Modern Italian": 1.0, "Italian / European": 0.95,
  "Modern European": 0.78, "Mediterranean": 0.7, "Caterer / Events": 0.7,
  "Deli / Mediterranean": 0.68, "French": 0.65, "Gastro-pub": 0.62,
  "Greek": 0.6, "Pizza & Pasta": 0.6, "Spanish / Tapas": 0.58,
  "British": 0.55, "Seafood": 0.5, "Steakhouse": 0.48,
  "Vegan / Plant-based": 0.45, "Other / Unknown": 0.4,
  "Middle Eastern": 0.2, "Cafe / Coffee": 0.2, "Indian": 0.2,
  "Chinese": 0.2, "Thai": 0.2, "Japanese / Sushi": 0.1,
  "Burgers": 0.0, "Fried chicken": 0.0, "Kebab": 0.0,
};

function leadScore(cuisine, priceTier) {
  const compat = CUISINE_COMPAT[cuisine] ?? 0.3;
  return Math.round(compat * 50) + Math.round((priceTier / 4) * 50);
}

// ── Google Places enrichment ───────────────────────────────────────────────────

// Maps Google Places (New) priceLevel enum → our 1-4 tier
const GOOGLE_PRICE = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE:    2,
  PRICE_LEVEL_EXPENSIVE:   3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Loose name similarity check to avoid accepting a completely wrong Place result.
function namesSimilar(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.slice(0, 5) === nb.slice(0, 5);
}

async function enrichWithPlaces(venue) {
  const query = `${venue.name} ${venue.postcode}`;
  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": PLACES_FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            // Use the venue's own coordinates so the bias works for any UK location
            center: { latitude: venue.latitude, longitude: venue.longitude },
            radius: 500.0, // 500 m — tight bias around the exact venue
          },
        },
        maxResultCount: 1,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`  Places ${res.status} for "${query}": ${text.slice(0, 120)}`);
      return null;
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;

    // Basic sanity check: reject clearly wrong matches
    const googleName = place.displayName?.text ?? "";
    if (!namesSimilar(venue.name, googleName)) return null;

    return {
      googlePlaceId:  place.id ?? undefined,
      phone:          place.nationalPhoneNumber ?? undefined,
      website:        place.websiteUri ?? undefined,
      businessStatus: place.businessStatus ?? undefined,
      // Only override our heuristic price when Google actually has a value
      priceTier: GOOGLE_PRICE[place.priceLevel] ?? undefined,
    };
  } catch (e) {
    console.warn(`  Places error for "${query}": ${e.message}`);
    return null;
  }
}

// ── Concurrency pool ───────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isStale(dateStr) {
  if (!dateStr) return true; // never enriched
  return Date.now() - new Date(dateStr).getTime() > ENRICH_TTL_DAYS * 86_400_000;
}

// ── Supabase Storage (base dataset host + enrichment cache) ─────────────────────

// Create the bucket (public) if it doesn't exist yet — makes first-time setup
// a no-op beyond providing the Supabase env vars.
async function ensureBucket() {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (check.ok) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`  Bucket create ${res.status}: ${(await res.text()).slice(0, 160)}`);
  } else {
    console.log(`Created public Storage bucket "${BUCKET}".`);
  }
}

// Pull the last uploaded dataset so enrichment/firstSeen carry over between runs.
async function downloadPreviousFromStorage() {
  try {
    const res = await fetch(storageObjectUrl, { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (res.status === 404) return null; // first run — nothing uploaded yet
    if (!res.ok) {
      console.warn(`  Storage download ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`  Storage download error: ${e.message}`);
    return null;
  }
}

async function uploadToStorage(payloadStr) {
  const res = await fetch(storageObjectUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "x-upsert": "true", // overwrite the existing object
      "cache-control": "max-age=86400",
    },
    body: payloadStr,
  });
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const todayStr = today();

  // 1. Load the previous dataset to preserve the enrichment cache and diff
  //    against it. Prefer Supabase Storage (survives CI runs) then local disk.
  const prevById = new Map(); // fhrsId (string) → previous venue record
  let prev = null;
  if (STORAGE_ENABLED) {
    await ensureBucket();
    prev = await downloadPreviousFromStorage();
    if (prev) console.log(`Loaded previous dataset from Supabase Storage (${prev.venues?.length ?? 0} venues).`);
  }
  if (!prev && existsSync(OUTPUT)) {
    try {
      prev = JSON.parse(readFileSync(OUTPUT, "utf8"));
      console.log(`Loaded previous dataset from ${OUTPUT}.`);
    } catch {
      console.warn("Could not parse existing JSON — starting fresh.");
    }
  }
  if (prev) {
    for (const v of prev.venues ?? []) prevById.set(v.id.replace("fsa-", ""), v);
  }

  // 2. Fetch FSA
  console.log(`\nFetching FSA establishments UK-wide…`);
  const seen = new Set();
  const fsaRaw = [];
  let page = 1, total = Infinity;

  while (fsaRaw.length < total) {
    const json = await getFsaPage(page);
    total = json.meta?.totalCount ?? fsaRaw.length;
    const ests = json.establishments ?? [];
    if (!ests.length) break;
    for (const e of ests) {
      if (seen.has(e.FHRSID)) continue;
      seen.add(e.FHRSID);
      const lat = parseFloat(e.geocode?.latitude);
      const lng = parseFloat(e.geocode?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      fsaRaw.push(e);
    }
    console.log(`  page ${page}: ${fsaRaw.length} / ${total}`);
    page++;
    if (page > 40) break; // safety (UK-wide needs ~28 pages)
  }

  // 3. Build venue records — diff against previous run
  const venues = [];
  let newCount = 0;

  for (const e of fsaRaw) {
    const fhrsId = String(e.FHRSID);
    const id     = `fsa-${fhrsId}`;
    const prev   = prevById.get(fhrsId);

    const name   = titleCase(e.BusinessName || "Unknown");
    const postcode = (e.PostCode || "").toUpperCase();
    // Preserve a previously classified cuisine (fix-cuisine / AI) unless it was
    // still unclassified ("Other / Unknown") — then re-run detection.
    const detectedCuisine = detectCuisine(e.BusinessName || "");
    const cuisine = (prev?.cuisineType && prev.cuisineType !== "Other / Unknown")
      ? prev.cuisineType
      : detectedCuisine;
    const addr   = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
      .filter((x) => x?.trim()).map(titleCase).join(", ");
    const lat    = Number(parseFloat(e.geocode.latitude).toFixed(5));
    const lng    = Number(parseFloat(e.geocode.longitude).toFixed(5));
    const rating = parseInt(e.RatingValue, 10);

    // Use the previous (potentially Google-enriched) price tier if we have it,
    // otherwise fall back to the name/postcode heuristic.
    const priceTier = prev?.priceTier ?? detectPrice(e.BusinessName || "", postcode, cuisine);

    if (!prev) newCount++;

    venues.push({
      id,
      name,
      address: addr,
      postcode,
      borough:      e.LocalAuthorityName || "Unknown",
      latitude:     lat,
      longitude:    lng,
      hygieneRating: Number.isFinite(rating) ? rating : undefined,
      cuisineType:  cuisine,
      priceTier,
      // Carry forward enriched contact / metadata from previous run
      phone:          prev?.phone,
      website:        prev?.website,
      googlePlaceId:  prev?.googlePlaceId,
      businessStatus: prev?.businessStatus,
      enrichedAt:     prev?.enrichedAt,
      firstSeenDate:  prev?.firstSeenDate ?? todayStr,
      lastSeenDate:   todayStr,
    });
  }

  console.log(`\nFSA: ${venues.length} venues total, ${newCount} new since last run.`);

  // 4. Score all venues (needed to decide what to enrich)
  for (const v of venues) {
    v._score = leadScore(v.cuisineType, v.priceTier);
  }

  // 5. Google Places enrichment
  if (!GOOGLE_API_KEY) {
    console.warn("\nNo GOOGLE_PLACES_API_KEY found — skipping Places enrichment.");
    console.warn("Add GOOGLE_PLACES_API_KEY to .env.local and re-run to enrich.");
  } else {
    const toEnrich = venues.filter(
      (v) => v._score >= ENRICH_MIN && isStale(v.enrichedAt)
    );

    console.log(`\nEnriching ${toEnrich.length} venues with Google Places…`);
    console.log(`  (score ≥ ${ENRICH_MIN}, not enriched in the last ${ENRICH_TTL_DAYS} days)`);
    console.log(`  Estimated cost: ~$${((toEnrich.length / 1000) * 40).toFixed(2)} USD`);

    let done = 0, contacts = 0;

    await runPool(toEnrich, async (venue) => {
      const result = await enrichWithPlaces(venue);
      if (result) {
        if (result.phone || result.website) contacts++;
        // Merge enrichment into venue
        if (result.googlePlaceId)  venue.googlePlaceId  = result.googlePlaceId;
        if (result.phone)          venue.phone          = result.phone;
        if (result.website)        venue.website        = result.website;
        if (result.businessStatus) venue.businessStatus = result.businessStatus;
        if (result.priceTier)      venue.priceTier      = result.priceTier;
      }
      // Mark as attempted even if Google found nothing — avoids retrying every week
      venue.enrichedAt = todayStr;

      done++;
      if (done % 50 === 0 || done === toEnrich.length) {
        process.stdout.write(`  ${done}/${toEnrich.length} enriched, ${contacts} contacts found\r`);
      }
    }, PLACES_CONCURRENCY);

    console.log(`\n  Complete: ${contacts} phone/website contacts found out of ${toEnrich.length} enriched.`);
  }

  // 6. Clean up internal score field and write output
  for (const v of venues) delete v._score;

  mkdirSync("public", { recursive: true });
  const payload = {
    generatedAt: todayStr,
    source:      "Food Standards Agency + Google Places — UK",
    totalCount:  venues.length,
    newThisRun:  newCount,
    venues,
  };
  const payloadStr = JSON.stringify(payload);
  writeFileSync(OUTPUT, payloadStr);

  if (STORAGE_ENABLED) {
    await uploadToStorage(payloadStr);
    console.log(`\nUploaded dataset to Supabase Storage bucket "${BUCKET}".`);
    console.log(`  Set this as NEXT_PUBLIC_DATASET_URL (locally + in Vercel):`);
    console.log(`  ${storagePublicUrl}`);
  } else {
    console.log(`\n(Supabase env vars not set — wrote local file only, no upload.)`);
  }

  // Summary
  const withPhone   = venues.filter((v) => v.phone).length;
  const withWebsite = venues.filter((v) => v.website).length;
  const enriched    = venues.filter((v) => v.enrichedAt).length;

  console.log(`\nWrote ${OUTPUT}`);
  console.log(`  Total venues : ${venues.length}`);
  console.log(`  New this run : ${newCount}`);
  console.log(`  Enriched     : ${enriched} (Google Places attempted)`);
  console.log(`  With phone   : ${withPhone} (${Math.round((withPhone / venues.length) * 100)}%)`);
  console.log(`  With website : ${withWebsite} (${Math.round((withWebsite / venues.length) * 100)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
