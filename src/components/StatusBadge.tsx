import type { LeadCategory, OutreachStatus, PriceTier } from "@/lib/types";

export function RecommendBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
      ✓ Recommended
    </span>
  );
}

// Marks a venue as part of a known restaurant chain (e.g. "Ask Italian").
export function ChainBadge({ brand }: { brand: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20"
      title={`Part of the ${brand} chain`}
    >
      ⛓ {brand}
    </span>
  );
}

const PRICE_TEXT: Record<PriceTier, string> = { 1: "£", 2: "££", 3: "£££", 4: "££££" };

export function PriceTag({ tier }: { tier: PriceTier }) {
  return (
    <span className="font-medium text-slate-700">
      <span className="text-slate-900">{PRICE_TEXT[tier]}</span>
      <span className="text-slate-300">{PRICE_TEXT[4].slice(tier)}</span>
    </span>
  );
}

const leadStyles: Record<LeadCategory, string> = {
  high: "bg-green-100 text-green-800 ring-green-600/20",
  good: "bg-amber-100 text-amber-800 ring-amber-600/20",
  possible: "bg-slate-100 text-slate-700 ring-slate-500/20",
  low: "bg-red-100 text-red-700 ring-red-600/20",
};

const leadLabel: Record<LeadCategory, string> = {
  high: "High priority",
  good: "Good lead",
  possible: "Possible",
  low: "Low priority",
};

export function LeadBadge({ category }: { category: LeadCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${leadStyles[category]}`}
    >
      {leadLabel[category]}
    </span>
  );
}

const outreachStyles: Record<OutreachStatus, string> = {
  not_contacted: "bg-slate-100 text-slate-600 ring-slate-400/20",
  draft_ready: "bg-indigo-100 text-indigo-700 ring-indigo-600/20",
  scheduled: "bg-purple-100 text-purple-700 ring-purple-600/20",
  sent: "bg-blue-100 text-blue-700 ring-blue-600/20",
  replied: "bg-teal-100 text-teal-700 ring-teal-600/20",
  bounced: "bg-orange-100 text-orange-700 ring-orange-600/20",
  converted: "bg-green-100 text-green-800 ring-green-600/20",
  unsubscribed: "bg-red-100 text-red-700 ring-red-600/20",
};

const outreachLabel: Record<OutreachStatus, string> = {
  not_contacted: "Not contacted",
  draft_ready: "Draft ready",
  scheduled: "Scheduled",
  sent: "Sent",
  replied: "Replied",
  bounced: "Bounced",
  converted: "Converted",
  unsubscribed: "Unsubscribed",
};

export function ConvertedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
      Converted
    </span>
  );
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function ContactedBadge({ lastAt }: { lastAt: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20">
      Contacted · {timeSince(lastAt)}
    </span>
  );
}

export function OutreachBadge({ status }: { status: OutreachStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${outreachStyles[status]}`}
    >
      {outreachLabel[status]}
    </span>
  );
}
