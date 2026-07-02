// Core domain types for the LTP prospecting tool.
// These mirror the data model in the PRD (section 14) and are the single
// source of truth the UI renders against. When the Supabase backend is added,
// the API layer should return these same shapes.

export type LeadCategory = "high" | "good" | "possible" | "low";

export type OutreachStatus =
  | "not_contacted"
  | "draft_ready"
  | "scheduled"
  | "sent"
  | "replied"
  | "bounced"
  | "converted"
  | "unsubscribed";

export type OpeningStatus = "open" | "opening_soon" | "new_this_week" | "closed";

// What happened on a contact/sales attempt. Drives the badge on each log entry.
export type ContactOutcome =
  | "called"
  | "emailed"
  | "visited"
  | "meeting"
  | "samples_sent"
  | "quote_sent"
  | "interested"
  | "not_interested"
  | "no_answer"
  | "follow_up"
  | "other";

// One entry in a venue's contact log: who tried to sell to this restaurant,
// when, and what happened. Persisted per-venue via the store (overrides / added).
export interface ContactNote {
  id: string;
  author: string; // who logged it (typed in — there are no per-user logins)
  text: string;
  outcome?: ContactOutcome;
  at: string; // ISO timestamp
}

// Pin / row colour buckets (PRD map + table colour coding).
export type PinStatus =
  | "high"
  | "medium"
  | "low"
  | "existing_customer"
  | "new_opening"
  | "excluded"
  | "closed";

// Compatibility is scored on TWO factors only: cuisine and price.
export type PriceTier = 1 | 2 | 3 | 4; // £ / ££ / £££ / ££££

export interface ScoreBreakdown {
  cuisineFit: number; // 0-50
  priceFit: number; // 0-50
}

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  postcode: string;
  borough: string;
  latitude: number;
  longitude: number;
  website?: string;
  phone?: string;
  email?: string;
  cuisineType: string;
  businessType: string;
  priceTier: PriceTier;
  hygieneRating?: number; // 0-5
  openingStatus: OpeningStatus;
  firstSeenDate: string;
  lastSeenDate: string;
  source: string;
  existingCustomer: boolean;
  excluded: boolean;
  insideDeliveryArea: boolean;
  leadScore: number; // 0-100
  leadCategory: LeadCategory;
  recommended: boolean; // compatible cuisine AND semi-high-class price
  scoreBreakdown: ScoreBreakdown;
  scoreReason: string;
  assignedOwner?: string;
  outreachStatus: OutreachStatus;
  menuSummary?: string;
  pastaRelevance?: string;
  notes?: string;
  // Timestamped log of contact/sales attempts (calls, emails, visits, outcomes).
  contactLog?: ContactNote[];
  // Customer account fields synced nightly from Power BI (only set once a
  // venue is matched as an existing customer — see src/lib/customer-sync.ts).
  customerContactName?: string;
  customerContactPhone?: string;
  customerContactEmail?: string;
  customerAccountManager?: string;
  nextAction?: string;
  openingEvidence?: string;
  expectedOpeningDate?: string;
  // Set true when someone clicks "Remove as new" — the venue is kept but drops
  // out of the New openings view, and a later web scan won't re-flag it as new.
  dismissedAsNew?: boolean;
  // Saved/AI-written outreach email (overrides the default template).
  emailSubject?: string;
  emailBody?: string;
  emailTo?: string;
}

export interface EmailDraft {
  id: string;
  restaurantId: string;
  restaurantName: string;
  to: string;
  subject: string;
  body: string;
  status: "ready" | "scheduled" | "sent" | "replied" | "bounced";
  scheduledFor?: string;
  salesperson?: string;
}
