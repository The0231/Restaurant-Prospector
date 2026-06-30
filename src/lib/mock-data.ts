import type {
  EmailDraft,
  LeadCategory,
  OpeningStatus,
  PriceTier,
  Restaurant,
  ScoreBreakdown,
} from "./types";

// =============================================================================
// SCORING — two factors only: cuisine fit + price point.
// "If the cuisine is compatible AND the venue is semi-high-class (price tier
// 3-4), recommend it." Everything below derives from these two inputs.
// =============================================================================

// Cuisine → compatibility weight (0-1), ranked by CLOSENESS TO ITALIAN cooking
// (where fresh pasta naturally fits). Italian is the anchor; broadly
// Italian-adjacent European styles (modern European, French, British,
// Mediterranean *mix*, gastro-pub) are decent fits; cuisines with their own
// distinct staples — Lebanese/Middle-Eastern, Indian, Chinese, sushi, fast
// food — are not a fit (and get excluded below 0.25).
export const CUISINES: { name: string; compat: number }[] = [
  { name: "Italian", compat: 1.0 },
  { name: "Modern Italian", compat: 1.0 },
  { name: "Italian / European", compat: 0.95 },
  { name: "Modern European", compat: 0.78 },
  { name: "Mediterranean", compat: 0.7 }, // mediterranean MIX — decent fit
  { name: "Caterer / Events", compat: 0.7 },
  { name: "Deli / Mediterranean", compat: 0.68 },
  { name: "French", compat: 0.65 },
  { name: "Gastro-pub", compat: 0.62 },
  { name: "Greek", compat: 0.6 },
  { name: "Pizza & Pasta", compat: 0.6 },
  { name: "Spanish / Tapas", compat: 0.58 },
  { name: "British", compat: 0.55 }, // close enough to Italian-style menus
  { name: "Seafood", compat: 0.5 },
  { name: "Steakhouse", compat: 0.48 },
  { name: "Vegan / Plant-based", compat: 0.45 },
  { name: "Other / Unknown", compat: 0.3 },
  { name: "Middle Eastern", compat: 0.2 }, // Lebanese/Turkish/Persian — NOT a fit
  { name: "Cafe / Coffee", compat: 0.2 },
  { name: "Indian", compat: 0.2 },
  { name: "Chinese", compat: 0.2 },
  { name: "Thai", compat: 0.2 },
  { name: "Japanese / Sushi", compat: 0.1 },
  { name: "Burgers", compat: 0.0 },
  { name: "Fried chicken", compat: 0.0 },
  { name: "Kebab", compat: 0.0 },
];

export const PRICE_LABELS: Record<PriceTier, string> = {
  1: "£ Budget",
  2: "££ Mid-range",
  3: "£££ Semi-premium",
  4: "££££ Premium",
};

export function cuisineCompatibility(cuisine: string): number {
  return CUISINES.find((c) => c.name === cuisine)?.compat ?? 0.3;
}

export function categoryForScore(score: number): LeadCategory {
  if (score >= 80) return "high";
  if (score >= 60) return "good";
  if (score >= 40) return "possible";
  return "low";
}

export interface ScoreResult {
  leadScore: number;
  leadCategory: LeadCategory;
  recommended: boolean;
  excluded: boolean;
  scoreBreakdown: ScoreBreakdown;
  scoreReason: string;
}

// The core two-factor scorer. Used for seed data, hydration and the add form.
export function scoreRestaurant(cuisine: string, priceTier: PriceTier): ScoreResult {
  const compat = cuisineCompatibility(cuisine);
  const cuisineFit = Math.round(compat * 50); // 0-50
  const priceFit = Math.round((priceTier / 4) * 50); // 12.5 → 50
  const leadScore = cuisineFit + priceFit;

  const cuisineCompatible = compat >= 0.5;
  const semiHighClass = priceTier >= 3;
  const recommended = cuisineCompatible && semiHighClass;
  const excluded = compat < 0.25; // fast food / sushi / cafes etc.

  const price = PRICE_LABELS[priceTier];
  let scoreReason: string;
  if (recommended) {
    scoreReason = `${cuisine} at a ${priceTier === 4 ? "premium" : "semi-premium"} price point (${price}) — strong cuisine and price fit, recommended for LTP outreach.`;
  } else if (cuisineCompatible && !semiHighClass) {
    scoreReason = `${cuisine} is a good cuisine fit, but the price point (${price}) is lower than ideal — possible lead.`;
  } else if (!cuisineCompatible && semiHighClass) {
    scoreReason = `Upmarket venue (${price}) but ${cuisine} is a weak cuisine fit for fresh pasta.`;
  } else {
    scoreReason = `${cuisine} at ${price} — low compatibility on both cuisine and price.`;
  }

  return {
    leadScore,
    leadCategory: categoryForScore(leadScore),
    recommended,
    excluded,
    scoreBreakdown: { cuisineFit, priceFit },
    scoreReason,
  };
}

// =============================================================================
// GEO — delivery-area helper
// =============================================================================

export const DELIVERY_CENTER: [number, number] = [51.5095, -0.1265];
export const DELIVERY_RADIUS_KM = 8;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// =============================================================================
// REAL DATA — hydrate the FSA dataset (public/london-restaurants.json) into
// full Restaurant objects with computed scores.
// =============================================================================

// Compact record shape stored in public/london-restaurants.json.
// Fields populated by fetch-fsa.mjs; Google Places fields only present after enrichment.
export interface RawVenue {
  id: string;
  name: string;
  address: string;
  postcode: string;
  borough: string;
  latitude: number;
  longitude: number;
  hygieneRating?: number;
  cuisineType: string;
  priceTier: PriceTier;
  // Google Places enrichment (present once the refresh script has run with a key)
  phone?: string;
  website?: string;
  googlePlaceId?: string;
  businessStatus?: string; // 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  enrichedAt?: string;     // ISO date of last Places enrichment attempt
  // Timestamps written by the refresh script
  firstSeenDate?: string;  // ISO date first appeared in FSA
  lastSeenDate?: string;   // ISO date last confirmed in FSA
}

export function hydrateVenue(raw: RawVenue): Restaurant {
  const score = scoreRestaurant(raw.cuisineType, raw.priceTier);
  const insideDeliveryArea =
    haversineKm(DELIVERY_CENTER, [raw.latitude, raw.longitude]) <= DELIVERY_RADIUS_KM;

  // Derive opening status from Google business_status and firstSeenDate
  let openingStatus: OpeningStatus = "open";
  if (
    raw.businessStatus === "CLOSED_PERMANENTLY" ||
    raw.businessStatus === "CLOSED_TEMPORARILY"
  ) {
    openingStatus = "closed";
  } else if (raw.firstSeenDate) {
    const daysSince = (Date.now() - new Date(raw.firstSeenDate).getTime()) / 86_400_000;
    if (daysSince <= 7) openingStatus = "new_this_week";
  }

  return {
    ...raw,
    businessType: "Restaurant",
    email: undefined,
    openingStatus,
    firstSeenDate: raw.firstSeenDate ?? "2026-02-12",
    lastSeenDate:  raw.lastSeenDate  ?? "2026-06-29",
    source: raw.googlePlaceId ? "FSA + Google Places" : "Food Standards Agency",
    existingCustomer: false,
    excluded: score.excluded,
    insideDeliveryArea,
    leadScore: score.leadScore,
    leadCategory: score.leadCategory,
    recommended: score.recommended,
    scoreBreakdown: score.scoreBreakdown,
    scoreReason: score.scoreReason,
    outreachStatus: "not_contacted",
  };
}

// Factory used by the "Add customer / restaurant" form and the assistant.
export function makeRestaurant(input: {
  id?: string;
  name: string;
  address: string;
  postcode: string;
  borough: string;
  latitude: number;
  longitude: number;
  cuisineType: string;
  businessType: string;
  priceTier: PriceTier;
  email?: string;
  phone?: string;
  website?: string;
  existingCustomer: boolean;
}): Restaurant {
  const score = scoreRestaurant(input.cuisineType, input.priceTier);
  const insideDeliveryArea =
    haversineKm(DELIVERY_CENTER, [input.latitude, input.longitude]) <= DELIVERY_RADIUS_KM;
  return {
    id: input.id ?? `r-user-${Math.random().toString(36).slice(2, 9)}`,
    name: input.name,
    address: input.address,
    postcode: input.postcode,
    borough: input.borough,
    latitude: input.latitude,
    longitude: input.longitude,
    website: input.website,
    phone: input.phone,
    email: input.email,
    cuisineType: input.cuisineType,
    businessType: input.businessType,
    priceTier: input.priceTier,
    hygieneRating: 5,
    openingStatus: "open",
    firstSeenDate: "2026-06-29",
    lastSeenDate: "2026-06-29",
    source: input.existingCustomer ? "Manually added (CRM)" : "Manually added",
    existingCustomer: input.existingCustomer,
    excluded: score.excluded,
    insideDeliveryArea,
    leadScore: score.leadScore,
    leadCategory: score.leadCategory,
    recommended: score.recommended,
    scoreBreakdown: score.scoreBreakdown,
    scoreReason: input.existingCustomer
      ? `Existing LTP customer. ${score.scoreReason}`
      : score.scoreReason,
    outreachStatus: input.existingCustomer ? "converted" : "not_contacted",
  };
}

// =============================================================================
// DERIVED HELPERS
// =============================================================================

export function buildEmailBody(name: string): string {
  return `Hi team,

I saw that ${name} has a strong menu and could be a great fit for fresh pasta.

La Tua Pasta is a London-based pastificio supplying fresh pasta to restaurants, hotels, caterers and food-service businesses. We make fresh pasta overnight in London and can support chefs with filled pasta, gnocchi, long pasta and seasonal specials.

Would you be open to receiving a sample box or trade catalogue?

Best,
[Salesperson Name]
La Tua Pasta

— Reply STOP to unsubscribe.`;
}

// Map a venue's outreach status to an email-pipeline column so approving a
// draft moves it from "Ready" to "Sent", etc.
const DRAFT_STATUS: Partial<Record<Restaurant["outreachStatus"], EmailDraft["status"]>> = {
  draft_ready: "ready",
  scheduled: "scheduled",
  sent: "sent",
  replied: "replied",
  bounced: "bounced",
};

// A destination email for a draft. We deliberately target a PROFESSIONAL / trade
// inbox (management/general business), never the booking system — LTP is doing
// B2B trade outreach, not making a reservation. Uses the venue's real email if
// known (unless it's a bookings@ address), otherwise a best-guess info@ address.
export function draftEmailFor(r: Restaurant): string {
  if (r.email && !/^bookings?@|^reservations?@|^reserve@|^table@/i.test(r.email)) return r.email;
  const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30) || "venue";
  return `info@${slug}.co.uk`;
}

export function buildDrafts(items: Restaurant[]): EmailDraft[] {
  return items
    .filter((r) => DRAFT_STATUS[r.outreachStatus])
    .map((r) => ({
      id: `e-${r.id}`,
      restaurantId: r.id,
      restaurantName: r.name,
      to: r.emailTo ?? draftEmailFor(r),
      subject: r.emailSubject ?? `Fresh pasta for ${r.name}`,
      body: r.emailBody ?? buildEmailBody(r.name),
      status: DRAFT_STATUS[r.outreachStatus]!,
      scheduledFor: r.outreachStatus === "scheduled" ? "2026-07-06 08:00" : undefined,
      salesperson: r.assignedOwner ?? "Unassigned",
    }));
}

export function funnelCounts(items: Restaurant[]) {
  const total = items.length;
  const relevant = items.filter((r) => !r.excluded).length;
  const scored = items.filter((r) => r.leadScore >= 40 && !r.excluded).length;
  const recommended = items.filter((r) => r.recommended && !r.existingCustomer).length;
  const newLeads = items.filter((r) => r.openingStatus === "new_this_week").length;
  const customers = items.filter((r) => r.existingCustomer).length;
  const contacted = items.filter((r) =>
    ["sent", "replied", "converted", "scheduled"].includes(r.outreachStatus)
  ).length;
  const replied = items.filter((r) => r.outreachStatus === "replied").length;
  const converted = items.filter((r) => r.outreachStatus === "converted").length;
  return { total, relevant, scored, recommended, newLeads, customers, contacted, replied, converted };
}
