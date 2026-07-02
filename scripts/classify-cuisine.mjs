// Classify cuisine for every "Other" venue using Claude Haiku.
//
// Run with:  node scripts/classify-cuisine.mjs
//
// Sends batches of 50 restaurants per request. Each call asks Claude to pick
// the best cuisine from our fixed list, or return "Other" if genuinely unclear.
// Estimated cost: ~$1-3 for 11,000 venues at Haiku pricing.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const OUTPUT = "public/uk-restaurants.json";
const BATCH_SIZE = 50;
const CONCURRENCY = 5; // parallel Claude calls

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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Cuisine list (must match mock-data.ts) ────────────────────────────────────

const VALID_CUISINES = [
  "Italian", "Modern Italian", "Italian / European",
  "Modern European", "French", "Mediterranean", "Deli / Mediterranean",
  "Greek", "Spanish / Tapas", "British", "Gastro-pub",
  "Seafood", "Steakhouse", "Vegan / Plant-based",
  "Pizza & Pasta", "Japanese / Sushi", "Chinese", "Indian", "Thai",
  "Middle Eastern", "Cafe / Coffee", "Burgers", "Fried chicken", "Kebab",
  "Other",
];

const CUISINE_SET = new Set(VALID_CUISINES);

// ── Scoring (mirrors mock-data.ts) ────────────────────────────────────────────

const CUISINE_COMPAT = {
  "Italian": 1.0, "Modern Italian": 1.0, "Italian / European": 0.95,
  "Modern European": 0.78, "Mediterranean": 0.7, "Caterer / Events": 0.7,
  "Deli / Mediterranean": 0.68, "French": 0.65, "Gastro-pub": 0.62,
  "Greek": 0.6, "Pizza & Pasta": 0.6, "Spanish / Tapas": 0.58,
  "British": 0.55, "Seafood": 0.5, "Steakhouse": 0.48,
  "Vegan / Plant-based": 0.45, "Other": 0.4, "Other / Unknown": 0.4,
  "Middle Eastern": 0.2, "Cafe / Coffee": 0.2, "Indian": 0.2,
  "Chinese": 0.2, "Thai": 0.2, "Japanese / Sushi": 0.1,
  "Burgers": 0.0, "Fried chicken": 0.0, "Kebab": 0.0,
};

function rescore(cuisine, priceTier) {
  const compat = CUISINE_COMPAT[cuisine] ?? 0.4;
  const cuisineFit = Math.round(compat * 50);
  const priceFit = Math.round((priceTier / 4) * 50);
  const leadScore = cuisineFit + priceFit;
  return {
    cuisineFit, priceFit, leadScore,
    leadCategory: leadScore >= 75 ? "high" : leadScore >= 60 ? "good" : leadScore >= 40 ? "possible" : "low",
    excluded: compat < 0.25,
    recommended: compat >= 0.5 && priceTier >= 3,
  };
}

// ── Claude classification ─────────────────────────────────────────────────────

const FALLBACK_MENU = "Menu details not available on website";

async function classifyBatch(venues) {
  const list = venues
    .map((v, i) => {
      const base = `${i + 1}. "${v.name}" — ${v.borough}, ${v.postcode}`;
      const menu = v.menuSummary && v.menuSummary !== FALLBACK_MENU
        ? `\n   Menu: ${v.menuSummary}`
        : "";
      return base + menu;
    })
    .join("\n");

  const prompt = `You are classifying London restaurants by cuisine type for a food supplier.

For each restaurant below, pick the single best cuisine from this list:
${VALID_CUISINES.join(", ")}

Rules:
- Use "Modern European" for fine dining / contemporary European with no clear single cuisine
- Use "British" for gastropubs serving food, traditional British, Sunday roast venues
- Use "Gastro-pub" for pubs with a strong food focus
- Use "Cafe / Coffee" for coffee shops, bakeries, brunch cafes
- Use "Other" ONLY if you genuinely cannot tell — hotel restaurants with no cuisine signal, private members clubs, catering companies, etc.
- Where a Menu line is provided, use it as the PRIMARY signal for classification
- Where no menu is available, base your guess on the name, location (borough/postcode), and cultural signals
- W1/SW1/WC2/EC postcodes with upscale-sounding names lean Modern European or Italian

Restaurants:
${list}

Reply with ONLY a JSON array of strings, one cuisine per restaurant, in order. Example:
["Italian", "French", "Other"]`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
    return arr.map((c) => (CUISINE_SET.has(c) ? c : "Other"));
  } catch {
    return venues.map(() => "Other");
  }
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function inBatches(items, batchSize, concurrency, fn) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  for (let i = 0; i < batches.length; i += concurrency) {
    await Promise.all(batches.slice(i, i + concurrency).map(fn));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(OUTPUT, "utf8"));
const venues = raw.venues;

const toClassify = venues.filter((v) => v.cuisineType === "Other" || v.cuisineType === "Other / Unknown");
console.log(`Classifying ${toClassify.length} "Other" venues with Claude Haiku…`);
console.log(`Batches: ${Math.ceil(toClassify.length / BATCH_SIZE)} × ${BATCH_SIZE} restaurants`);

let done = 0;
let changed = 0;

const batches = [];
for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
  batches.push(toClassify.slice(i, i + BATCH_SIZE));
}

for (let i = 0; i < batches.length; i += CONCURRENCY) {
  await Promise.all(
    batches.slice(i, i + CONCURRENCY).map(async (batch) => {
      const results = await classifyBatch(batch);
      for (let j = 0; j < batch.length; j++) {
        const newCuisine = results[j] ?? "Other";
        const oldCuisine = batch[j].cuisineType;
        // Always update: reclassify to specific cuisine, or rename "Other / Unknown" → "Other"
        if (newCuisine !== oldCuisine || oldCuisine === "Other / Unknown") {
          batch[j].cuisineType = newCuisine;
          const s = rescore(newCuisine, batch[j].priceTier);
          batch[j].leadScore = s.leadScore;
          batch[j].leadCategory = s.leadCategory;
          batch[j].excluded = s.excluded;
          batch[j].recommended = s.recommended;
          batch[j].scoreBreakdown = { cuisineFit: s.cuisineFit, priceFit: s.priceFit };
          if (newCuisine !== "Other") changed++;
        }
      }
      done += batch.length;
      process.stdout.write(`  ${done}/${toClassify.length} classified, ${changed} reclassified\r`);
    })
  );
}

console.log(`\nDone: ${changed} of ${toClassify.length} venues reclassified from "Other".`);
console.log(`Remaining as "Other": ${toClassify.length - changed}`);

writeFileSync(OUTPUT, JSON.stringify({ venues }, null, 0));
console.log(`Written to ${OUTPUT}`);
