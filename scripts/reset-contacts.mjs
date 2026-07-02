// Reset enrichedAt for venues with no phone AND no website so fetch-fsa.mjs
// will re-enrich them via Google Places on next run.
//
// Run with:  node scripts/reset-contacts.mjs
//            then: node scripts/fetch-fsa.mjs

import { writeFileSync, readFileSync } from "node:fs";

const OUTPUT = "public/uk-restaurants.json";
const raw = JSON.parse(readFileSync(OUTPUT, "utf8"));
const venues = raw.venues;

let reset = 0;
for (const v of venues) {
  if (!v.phone && !v.website && v.enrichedAt) {
    delete v.enrichedAt;
    reset++;
  }
}

writeFileSync(OUTPUT, JSON.stringify({ venues }, null, 0));
console.log(`Reset enrichedAt for ${reset} venues — run fetch-fsa.mjs to re-enrich.`);
