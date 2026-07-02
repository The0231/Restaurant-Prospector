// One-off script: reclassify every "Other / Unknown" venue in the existing JSON.
//
// Run with:  node scripts/fix-cuisine.mjs
//
// Step 1 (free):   Re-apply the expanded detectCuisine() over every Unknown venue.
// Step 2 (cheap):  For venues still Unknown, call Google Places (New) Text Search
//                  with ONLY places.primaryType — this is the Basic tier at ~$5/1000
//                  (vs $40/1000 for phone/website). Typical run cost: ~$20-40.
// Step 3 (free):   Re-score everything and rename "Other / Unknown" → "Other".
//
// Venues already enriched with phone/website are NOT re-hit for Contact data.
// Only the cheap primaryType lookup is performed here.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUTPUT = "public/uk-restaurants.json";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
// Basic tier only — primaryType costs ~$5/1000, NOT the $40/1000 Contact tier
const BASIC_FIELDS = "places.id,places.displayName,places.primaryType,places.types";
const CONCURRENCY = 10;

// ── Env ───────────────────────────────────────────────────────────────────────

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

// ── Cuisine detection (mirrors fetch-fsa.mjs) ─────────────────────────────────

function detectCuisine(name) {
  const n = name.toLowerCase();
  const has = (...ks) => ks.some((k) => n.includes(k));
  if (has("pizz", "forno", "pizza express", "zizzi", "prezzo")) return "Pizza & Pasta";
  if (has("trattor", "osteria", "ristorante", "italian", "cucina", "pasta", "gnocch", "napoli", "naples",
           "milano", "milan", "romano", "amalfi", "toscana", "venezia", "venice", "sicilia", "firenze",
           "sardinia", "puglia", "al dente", "al forno", "la dolce", "la trattoria", "la pasta",
           "la cucina", "la famiglia", "la piazza", "bella italia", "fratelli", "al porto")) return "Italian";
  if (has("sushi", "sashimi", "japan", "ramen", "katsu", "izakaya", "wasabi", "sakura",
           "teriyaki", "bento", "udon", "tonkotsu", "yakitori", "wagyu", "miso", "omakase",
           "nobu", "matsuri", "zuma", "roka", "kikuchi", "engawa", "kurobuta")) return "Japanese / Sushi";
  if (has("thai", "bangkok", "lemongrass", "siam", "pad thai", "som tam", "khao")) return "Thai";
  if (has("chinese", "china", " wok", "noodle", "dim sum", "dumpling", "szechuan", "sichuan",
           "canton", "peking", "oriental", "yum cha", "hot pot", "baozi", "xiao long",
           "hutong", "ping pong", "hakkasan", "yauatcha")) return "Chinese";
  if (has("india", "tandoor", "masala", "curry", "biryani", "bombay", "delhi", "punjab",
           "balti", "tikka", "chutney", "lassi", "dal ", "dosa", "naan", "chai",
           "dishoom", "gymkhana", "benares", "tamarind")) return "Indian";
  if (has("burger", "patty", "smash", "shake shack", "five guys", "honest burger",
           "dirty burger", "bleecker")) return "Burgers";
  if (has("fried chicken", "chicken cottage", "perfect fried", "chicken shop", "kfc",
           "popeyes", "nando")) return "Fried chicken";
  if (has("kebab", "shawarma", "doner", "donner", "iskender")) return "Kebab";
  if (has("greek", "souvlaki", "mykonos", "athena", "gyros", "taverna", "hellenic",
           "crete", "athens", "cyprus", "mezedopolio")) return "Greek";
  if (has("tapas", "spanish", "iberica", "tapeo", "catalan", "paella", "bodega",
           "andalucia", "rioja", "pintxo", "basque")) return "Spanish / Tapas";
  if (has("lebanese", "turkish", "persian", "beirut", "ottoman", "levant", "mezze", "meze",
           "falafel", "anatolia", "kurdish", "arabic", "hummus", "fattoush", "arabian",
           "maroush", "noura", "ranoush", "comptoir libanais")) return "Middle Eastern";
  if (has("mediterran", "riviera")) return "Mediterranean";
  if (has("brasserie", "french", "maison", "bistro", "provence", "bordeaux", "lyon",
           "normandy", "alsace", "escargot", "coq au vin", "bouillabaisse", "crepe",
           "le gavroche", "la petite", "le manoir", "boulestin")) return "French";
  if (has("steak", "grill", "smokehouse", "bbq", "barbecue", "smoked", "hawksmoor",
           "goodman", "maze grill", "chop house", "cut ")) return "Steakhouse";
  if (has("seafood", "oyster", "fishery", "prawn", "lobster", "crab", "fish market",
           "scott's", "j sheekey", "sheekey", "bentley's", "fishmonger")) return "Seafood";
  if (has("british", "carvery", "sunday roast", "pie & mash", "pie and mash",
           "fish & chips", "fish and chips", "chippy", "chip shop", "rib room",
           "afternoon tea", "rules restaurant", "roast ", " roast", "pudding", "yorkshire")) return "British";
  if (has("vegan", "plant based", "plant-based", "vegetarian", "veggie")) return "Vegan / Plant-based";
  if (has("deli", "delicatessen", "larder", "charcuterie")) return "Deli / Mediterranean";
  if (has("pub", "tavern", " arms", " inn", " tap", "alehouse", "gastropub", "freehouse")) return "Gastro-pub";
  if (has("cafe", "caffe", "coffee", "espresso", "costa", "starbucks", "pret", "barista",
           "bakery", "patisserie", "boulangerie", "croissant")) return "Cafe / Coffee";
  if (has("modern european", "fine dining", "tasting menu", "atelier", "chef's table")) return "Modern European";
  if (has(" hotel ") || n.startsWith("hotel ")) return "Modern European";
  return null; // still unknown — needs Places lookup
}

// ── Google Places primaryType → our cuisine ───────────────────────────────────

const GOOGLE_TYPE_MAP = {
  italian_restaurant:          "Italian",
  french_restaurant:           "French",
  japanese_restaurant:         "Japanese / Sushi",
  sushi_restaurant:            "Japanese / Sushi",
  ramen_restaurant:            "Japanese / Sushi",
  chinese_restaurant:          "Chinese",
  indian_restaurant:           "Indian",
  thai_restaurant:             "Thai",
  greek_restaurant:            "Greek",
  spanish_restaurant:          "Spanish / Tapas",
  mediterranean_restaurant:    "Mediterranean",
  middle_eastern_restaurant:   "Middle Eastern",
  lebanese_restaurant:         "Middle Eastern",
  turkish_restaurant:          "Middle Eastern",
  seafood_restaurant:          "Seafood",
  steak_house:                 "Steakhouse",
  barbecue_restaurant:         "Steakhouse",
  vegan_restaurant:            "Vegan / Plant-based",
  vegetarian_restaurant:       "Vegan / Plant-based",
  pizza_restaurant:            "Pizza & Pasta",
  modern_european_restaurant:  "Modern European",
  european_restaurant:         "Modern European",
  fine_dining_restaurant:      "Modern European",
  british_restaurant:          "British",
  american_restaurant:         "British", // best fit for LTP context
  hamburger_restaurant:        "Burgers",
  fast_food_restaurant:        "Burgers",
  coffee_shop:                 "Cafe / Coffee",
  cafe:                        "Cafe / Coffee",
  bakery:                      "Cafe / Coffee",
  pub:                         "Gastro-pub",
  bar_and_grill:               "Steakhouse",
  deli:                        "Deli / Mediterranean",
};

function cuisineFromGoogleTypes(primaryType, types = []) {
  // Try primaryType first, then scan all types for a match
  for (const t of [primaryType, ...types]) {
    if (t && GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  }
  return null;
}

// ── Scoring (mirrors mock-data.ts) ────────────────────────────────────────────

const CUISINE_COMPAT = {
  "Italian": 1.0, "Modern Italian": 1.0, "Italian / European": 0.95,
  "Modern European": 0.78, "Mediterranean": 0.7, "Caterer / Events": 0.7,
  "Deli / Mediterranean": 0.68, "French": 0.65, "Gastro-pub": 0.62,
  "Greek": 0.6, "Pizza & Pasta": 0.6, "Spanish / Tapas": 0.58,
  "British": 0.55, "Seafood": 0.5, "Steakhouse": 0.48,
  "Vegan / Plant-based": 0.45, "Other": 0.4,
  "Middle Eastern": 0.2, "Cafe / Coffee": 0.2, "Indian": 0.2,
  "Chinese": 0.2, "Thai": 0.2, "Japanese / Sushi": 0.1,
  "Burgers": 0.0, "Fried chicken": 0.0, "Kebab": 0.0,
};

function rescore(cuisine, priceTier) {
  const compat = CUISINE_COMPAT[cuisine] ?? 0.4;
  const cuisineFit = Math.round(compat * 50);
  const priceFit = Math.round((priceTier / 4) * 50);
  const leadScore = cuisineFit + priceFit;
  const leadCategory =
    leadScore >= 75 ? "high" :
    leadScore >= 60 ? "good" :
    leadScore >= 40 ? "possible" : "low";
  const excluded = compat < 0.25;
  const recommended = compat >= 0.5 && priceTier >= 3;
  return { cuisineFit, priceFit, leadScore, leadCategory, excluded, recommended };
}

// ── Places API call ───────────────────────────────────────────────────────────

function norm(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function namesSimilar(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.slice(0, 5) === nb.slice(0, 5);
}

async function fetchCuisineFromPlaces(venue) {
  if (!GOOGLE_API_KEY) return null;
  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": BASIC_FIELDS,
      },
      body: JSON.stringify({
        textQuery: `${venue.name} ${venue.postcode}`,
        locationBias: {
          circle: { center: { latitude: 51.5074, longitude: -0.1278 }, radius: 30000 },
        },
        maxResultCount: 1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    if (!namesSimilar(venue.name, place.displayName?.text ?? "")) return null;
    return cuisineFromGoogleTypes(place.primaryType, place.types ?? []);
  } catch {
    return null;
  }
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(OUTPUT, "utf8"));
const venues = raw.venues;

// Step 1: name-based reclassification (free, instant)
let step1Fixed = 0;
for (const v of venues) {
  if (v.cuisineType !== "Other / Unknown") continue;
  const detected = detectCuisine(v.name);
  if (detected) {
    v.cuisineType = detected;
    step1Fixed++;
  }
}
console.log(`Step 1 (name detection): ${step1Fixed} venues reclassified.`);

// Step 2: Google Places primaryType for remaining unknowns
const stillUnknown = venues.filter((v) => v.cuisineType === "Other / Unknown");
console.log(`Step 2 (Google Places): ${stillUnknown.length} venues to look up.`);
if (!GOOGLE_API_KEY) {
  console.log("  No GOOGLE_PLACES_API_KEY — skipping Places lookup.");
} else {
  console.log(`  Estimated cost: ~$${((stillUnknown.length / 1000) * 5).toFixed(2)} (Basic tier)`);
  let step2Fixed = 0;
  let done = 0;
  await inBatches(stillUnknown, CONCURRENCY, async (v) => {
    const cuisine = await fetchCuisineFromPlaces(v);
    done++;
    if (cuisine) {
      v.cuisineType = cuisine;
      step2Fixed++;
    }
    if (done % 500 === 0) process.stdout.write(`  ${done}/${stillUnknown.length} looked up, ${step2Fixed} classified\r`);
  });
  console.log(`\n  Step 2: ${step2Fixed} venues reclassified from Google Places.`);
}

// Step 3: rename remaining "Other / Unknown" → "Other"
let renamed = 0;
for (const v of venues) {
  if (v.cuisineType === "Other / Unknown") {
    v.cuisineType = "Other";
    renamed++;
  }
}
console.log(`Step 3: ${renamed} venues renamed "Other / Unknown" → "Other".`);

// Step 4: re-score everything whose cuisine changed
let rescored = 0;
for (const v of venues) {
  const s = rescore(v.cuisineType, v.priceTier);
  if (s.leadScore !== v.leadScore) {
    v.leadScore = s.leadScore;
    v.leadCategory = s.leadCategory;
    v.excluded = s.excluded;
    v.recommended = s.recommended;
    v.scoreBreakdown = { cuisineFit: s.cuisineFit, priceFit: s.priceFit };
    rescored++;
  }
}
console.log(`Step 4: ${rescored} venues re-scored.`);

writeFileSync(OUTPUT, JSON.stringify({ venues }, null, 0));
console.log(`\nDone. Written to ${OUTPUT}`);
