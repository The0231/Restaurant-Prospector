import { CUISINES, makeRestaurant } from "./mock-data";
import type { OpeningStatus, PriceTier, Restaurant } from "./types";

// Shape returned by the web-scan API and accepted by the assistant.
export interface ScannedOpening {
  name: string;
  area?: string;
  // UK-wide scans return the city/town (e.g. "Manchester", "Bristol"); London
  // scans leave this blank or set it to "London".
  city?: string;
  cuisine?: string;
  openingDate?: string;
  evidence?: string;
  url?: string;
}

// Rough geocoding for common London areas/boroughs so scanned openings land in
// roughly the right place on the map. Falls back to central London + jitter.
const AREA_GEO: Record<string, { lat: number; lng: number; borough: string }> = {
  soho: { lat: 51.5135, lng: -0.1325, borough: "Westminster" },
  mayfair: { lat: 51.5101, lng: -0.1476, borough: "Westminster" },
  marylebone: { lat: 51.5201, lng: -0.1503, borough: "Westminster" },
  fitzrovia: { lat: 51.5197, lng: -0.1357, borough: "Westminster" },
  victoria: { lat: 51.4952, lng: -0.1441, borough: "Westminster" },
  westminster: { lat: 51.4975, lng: -0.1357, borough: "Westminster" },
  "covent garden": { lat: 51.5129, lng: -0.1243, borough: "Westminster" },
  camden: { lat: 51.539, lng: -0.1426, borough: "Camden" },
  bloomsbury: { lat: 51.5219, lng: -0.1244, borough: "Camden" },
  hampstead: { lat: 51.5559, lng: -0.178, borough: "Camden" },
  kingscross: { lat: 51.5308, lng: -0.1238, borough: "Camden" },
  "king's cross": { lat: 51.5308, lng: -0.1238, borough: "Camden" },
  islington: { lat: 51.5362, lng: -0.1031, borough: "Islington" },
  angel: { lat: 51.5326, lng: -0.1058, borough: "Islington" },
  shoreditch: { lat: 51.5262, lng: -0.0786, borough: "Hackney" },
  hackney: { lat: 51.545, lng: -0.0553, borough: "Hackney" },
  dalston: { lat: 51.546, lng: -0.076, borough: "Hackney" },
  "london fields": { lat: 51.541, lng: -0.06, borough: "Hackney" },
  spitalfields: { lat: 51.519, lng: -0.075, borough: "Tower Hamlets" },
  "canary wharf": { lat: 51.5054, lng: -0.0235, borough: "Tower Hamlets" },
  whitechapel: { lat: 51.5195, lng: -0.0606, borough: "Tower Hamlets" },
  bermondsey: { lat: 51.498, lng: -0.081, borough: "Southwark" },
  borough: { lat: 51.5045, lng: -0.0905, borough: "Southwark" },
  peckham: { lat: 51.473, lng: -0.069, borough: "Southwark" },
  brixton: { lat: 51.4626, lng: -0.1132, borough: "Lambeth" },
  waterloo: { lat: 51.5036, lng: -0.1132, borough: "Lambeth" },
  battersea: { lat: 51.472, lng: -0.166, borough: "Wandsworth" },
  clapham: { lat: 51.462, lng: -0.138, borough: "Wandsworth" },
  chelsea: { lat: 51.4875, lng: -0.1687, borough: "Kensington and Chelsea" },
  "notting hill": { lat: 51.5095, lng: -0.196, borough: "Kensington and Chelsea" },
  kensington: { lat: 51.5009, lng: -0.1925, borough: "Kensington and Chelsea" },
  fulham: { lat: 51.48, lng: -0.195, borough: "Hammersmith and Fulham" },
  hammersmith: { lat: 51.4927, lng: -0.224, borough: "Hammersmith and Fulham" },
  "the city": { lat: 51.5155, lng: -0.0922, borough: "City of London" },
  city: { lat: 51.5155, lng: -0.0922, borough: "City of London" },
  greenwich: { lat: 51.481, lng: -0.0096, borough: "Greenwich" },
};

// Major UK cities/towns for UK-wide scans. The "borough" is the city name
// itself — deliberately NOT a London borough — so isLondon() returns false and
// London-only viewers don't see these, and they land on the right part of the map.
const UK_CITY_GEO: Record<string, { lat: number; lng: number; borough: string }> = {
  manchester: { lat: 53.4808, lng: -2.2426, borough: "Manchester" },
  birmingham: { lat: 52.4862, lng: -1.8904, borough: "Birmingham" },
  liverpool: { lat: 53.4084, lng: -2.9916, borough: "Liverpool" },
  leeds: { lat: 53.8008, lng: -1.5491, borough: "Leeds" },
  sheffield: { lat: 53.3811, lng: -1.4701, borough: "Sheffield" },
  bristol: { lat: 51.4545, lng: -2.5879, borough: "Bristol" },
  newcastle: { lat: 54.9783, lng: -1.6178, borough: "Newcastle" },
  nottingham: { lat: 52.9548, lng: -1.1581, borough: "Nottingham" },
  leicester: { lat: 52.6369, lng: -1.1398, borough: "Leicester" },
  glasgow: { lat: 55.8642, lng: -4.2518, borough: "Glasgow" },
  edinburgh: { lat: 55.9533, lng: -3.1883, borough: "Edinburgh" },
  cardiff: { lat: 51.4816, lng: -3.1791, borough: "Cardiff" },
  belfast: { lat: 54.5973, lng: -5.9301, borough: "Belfast" },
  brighton: { lat: 50.8225, lng: -0.1372, borough: "Brighton" },
  oxford: { lat: 51.752, lng: -1.2577, borough: "Oxford" },
  cambridge: { lat: 52.2053, lng: 0.1218, borough: "Cambridge" },
  bath: { lat: 51.3811, lng: -2.359, borough: "Bath" },
  york: { lat: 53.96, lng: -1.0873, borough: "York" },
  bournemouth: { lat: 50.7192, lng: -1.8808, borough: "Bournemouth" },
  southampton: { lat: 50.9097, lng: -1.4044, borough: "Southampton" },
  portsmouth: { lat: 50.8198, lng: -1.088, borough: "Portsmouth" },
  reading: { lat: 51.4543, lng: -0.9781, borough: "Reading" },
  plymouth: { lat: 50.3755, lng: -4.1427, borough: "Plymouth" },
  aberdeen: { lat: 57.1497, lng: -2.0943, borough: "Aberdeen" },
  dundee: { lat: 56.462, lng: -2.9707, borough: "Dundee" },
  norwich: { lat: 52.6309, lng: 1.2974, borough: "Norwich" },
};

// Map a neighbourhood/area name to its borough (e.g. "Soho" → "Westminster").
export function areaToBorough(area: string): string | null {
  const a = area.toLowerCase();
  for (const key of Object.keys(AREA_GEO)) {
    if (a.includes(key)) return AREA_GEO[key].borough;
  }
  return null;
}

function geocodeArea(area?: string, city?: string): { lat: number; lng: number; borough: string } {
  const a = (area || "").toLowerCase();
  const c = (city || "").toLowerCase();

  // A known non-London UK city wins first — never fall into London geocoding.
  if (c && !c.includes("london")) {
    for (const key of Object.keys(UK_CITY_GEO)) {
      if (c.includes(key) || a.includes(key)) return UK_CITY_GEO[key];
    }
    // Outside London but city unknown → neutral central-UK point, non-London borough.
    return { lat: 52.8 + (Math.random() - 0.5) * 0.4, lng: -1.8 + (Math.random() - 0.5) * 0.4, borough: "United Kingdom" };
  }

  // London (city blank or explicitly "London") → precise neighbourhood/borough.
  for (const key of Object.keys(AREA_GEO)) {
    if (a.includes(key)) return AREA_GEO[key];
  }
  return { lat: 51.5074 + (Math.random() - 0.5) * 0.06, lng: -0.1278 + (Math.random() - 0.5) * 0.09, borough: "Westminster" };
}

function normaliseCuisine(c?: string): string {
  if (!c) return "Other / Unknown";
  const exact = CUISINES.find((x) => x.name.toLowerCase() === c.toLowerCase());
  if (exact) return exact.name;
  const s = c.toLowerCase();
  if (s.includes("ital")) return "Italian";
  if (s.includes("pizza") || s.includes("pasta")) return "Pizza & Pasta";
  if (s.includes("medit")) return "Mediterranean";
  if (s.includes("french")) return "French";
  if (s.includes("brit") || s.includes("modern european") || s.includes("europ")) return "Modern European";
  if (s.includes("japan") || s.includes("sushi")) return "Japanese / Sushi";
  if (s.includes("indian")) return "Indian";
  if (s.includes("chin")) return "Chinese";
  return "Other / Unknown";
}

function openingStatusFor(dateText?: string): OpeningStatus {
  const t = (dateText || "").toLowerCase();
  // Future-leaning language or any month from July onward (relative to ~mid-2026) → opening soon.
  if (/soon|opening|opens|coming|upcoming|later|jul|aug|sep|oct|nov|dec|2026-(0[7-9]|1[0-2])|202[7-9]/.test(t)) return "opening_soon";
  return "new_this_week";
}

// Turn scanned openings into store mutations: existing venues get a patch,
// genuinely new ones become added records. Pure — caller applies via the store.
export function prepareOpenings(
  openings: ScannedOpening[],
  existing: Restaurant[]
): { toAdd: Restaurant[]; toUpdate: Record<string, Partial<Restaurant>>; total: number } {
  const toAdd: Restaurant[] = [];
  const toUpdate: Record<string, Partial<Restaurant>> = {};
  const byNameLower = new Map<string, Restaurant>();
  for (const r of existing) byNameLower.set(r.name.toLowerCase(), r);

  for (const o of openings) {
    if (!o || typeof o !== "object") continue; // skip malformed entries, keep the rest
    const name = (o.name || "").trim();
    if (!name) continue;
    const status = openingStatusFor(o.openingDate);
    const evidence = o.evidence || o.url || "Found via web scan";
    // Exact name match first; only fall back to substring for reasonably long
    // names (avoids "Bar"/"Pizza" patching an unrelated venue).
    const lower = name.toLowerCase();
    const known =
      byNameLower.get(lower) ||
      (lower.length >= 6 ? existing.find((r) => r.name.toLowerCase().includes(lower)) : undefined);

    if (known) {
      // Respect an explicit "Remove as new" — never resurrect a dismissed venue.
      if (known.dismissedAsNew) continue;
      toUpdate[known.id] = {
        openingStatus: status,
        openingEvidence: evidence,
        expectedOpeningDate: o.openingDate,
        source: "Web scan",
        website: o.url ?? known.website,
      };
      continue;
    }

    const geo = geocodeArea(o.area, o.city);
    const r = makeRestaurant({
      name,
      address: [o.area, o.city].filter(Boolean).join(", "),
      postcode: "",
      borough: geo.borough,
      latitude: geo.lat,
      longitude: geo.lng,
      cuisineType: normaliseCuisine(o.cuisine),
      businessType: "Restaurant",
      priceTier: 3 as PriceTier,
      website: o.url,
      existingCustomer: false,
    });
    toAdd.push({
      ...r,
      openingStatus: status,
      openingEvidence: evidence,
      expectedOpeningDate: o.openingDate,
      source: "Web scan",
    });
  }
  return { toAdd, toUpdate, total: toAdd.length + Object.keys(toUpdate).length };
}
