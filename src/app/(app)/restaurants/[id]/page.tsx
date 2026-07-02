"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChainBadge, LeadBadge, OutreachBadge, PriceTag, RecommendBadge } from "@/components/StatusBadge";
import { PRICE_LABELS } from "@/lib/mock-data";
import { detectChain } from "@/lib/chains";
import { useRestaurants } from "@/lib/store";
import type { ContactNote, ContactOutcome, Restaurant, ScoreBreakdown } from "@/lib/types";

const OUTCOME_LABELS: Record<ContactOutcome, string> = {
  called: "Called",
  emailed: "Emailed",
  visited: "Visited",
  meeting: "Meeting",
  samples_sent: "Samples sent",
  quote_sent: "Quote sent",
  interested: "Interested",
  not_interested: "Not interested",
  no_answer: "No answer",
  follow_up: "Follow-up",
  other: "Note",
};

const OUTCOME_STYLE: Record<ContactOutcome, string> = {
  called: "bg-slate-100 text-slate-700",
  emailed: "bg-slate-100 text-slate-700",
  visited: "bg-slate-100 text-slate-700",
  meeting: "bg-indigo-100 text-indigo-700",
  samples_sent: "bg-indigo-100 text-indigo-700",
  quote_sent: "bg-indigo-100 text-indigo-700",
  interested: "bg-green-100 text-green-700",
  not_interested: "bg-red-100 text-red-700",
  no_answer: "bg-amber-100 text-amber-700",
  follow_up: "bg-amber-100 text-amber-700",
  other: "bg-slate-100 text-slate-700",
};

const SCORE_ROWS: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
  { key: "cuisineFit", label: "Cuisine fit", max: 50 },
  { key: "priceFit", label: "Price point fit", max: 50 },
];

function barColor(val: number, max: number): string {
  const pct = val / max;
  if (pct >= 0.6) return "bg-green-500";
  if (pct >= 0.35) return "bg-amber-400";
  return "bg-red-500";
}

export default function RestaurantProfile() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { restaurants, updateRestaurant } = useRestaurants();
  const r = restaurants.find((x) => x.id === params.id);

  if (!r) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
        Restaurant not found.{" "}
        <Link href="/leads" className="text-brand-600 hover:underline">
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/leads" className="mb-3 inline-block text-sm text-brand-600 hover:underline">
        ← Back to leads
      </Link>
      <PageHeader
        title={r.name}
        subtitle={`${r.cuisineType} · ${r.businessType} · ${r.borough}`}
        action={
          <div className="flex items-center gap-3">
            {detectChain(r.name) && <ChainBadge brand={detectChain(r.name)!} />}
            {r.existingCustomer && (
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">LTP customer</span>
            )}
            {r.recommended && !r.existingCustomer && <RecommendBadge />}
            <span className="text-2xl font-bold text-slate-900">{r.leadScore}</span>
            <LeadBadge category={r.leadCategory} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Why this lead scored {r.leadScore} — cuisine + price
            </h2>
            <p className="mb-4 text-sm text-slate-600">{r.scoreReason}</p>
            <div className="space-y-3">
              {SCORE_ROWS.map(({ key, label, max }) => {
                const val = r.scoreBreakdown[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-sm text-slate-600">{label}</div>
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${barColor(val, max)}`} style={{ width: `${(val / max) * 100}%` }} />
                    </div>
                    <div className="w-14 shrink-0 text-right text-sm font-medium text-slate-700">{val}/{max}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Menu &amp; pasta relevance</h2>
            <p className="text-sm text-slate-600"><span className="font-medium">Menu:</span> {r.menuSummary ?? "—"}</p>
            <p className="mt-1 text-sm text-slate-600"><span className="font-medium">Pasta fit:</span> {r.pastaRelevance ?? "—"}</p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Source evidence</h2>
            <p className="text-sm text-slate-600">{r.source}</p>
            {r.openingEvidence && <p className="mt-1 text-sm text-slate-500">{r.openingEvidence}</p>}
          </div>

          <ContactLog r={r} onChange={(log) => updateRestaurant(r.id, { contactLog: log })} />
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Contact &amp; status</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Address" value={`${r.address}, ${r.postcode}`} />
              <Row label="Email" node={r.email ? <a className="text-brand-600 hover:underline" href={`mailto:${r.email}`}>{r.email}</a> : "—"} />
              <Row label="Phone" node={r.phone ? <a className="text-brand-600 hover:underline" href={`tel:${r.phone}`}>{r.phone}</a> : "—"} />
              <Row label="Website" node={r.website ? <a className="text-brand-600 hover:underline" href={r.website} target="_blank" rel="noreferrer">Visit site ↗</a> : "—"} />
              <Row label="Price point" value={PRICE_LABELS[r.priceTier]} />
              <Row label="Hygiene rating" value={r.hygieneRating ? `${r.hygieneRating}/5` : "—"} />
              <Row label="Delivery area" value={r.insideDeliveryArea ? "Inside" : "Outside (lower priority)"} />
              <Row label="Assigned to" value={r.assignedOwner ?? "Unassigned"} />
            </dl>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">Outreach</span>
              <OutreachBadge status={r.outreachStatus} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">{r.excluded ? "Excluded from pipeline" : "In pipeline"}</span>
              <button
                onClick={() => updateRestaurant(r.id, { excluded: !r.excluded })}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${r.excluded ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-red-50 text-red-700 hover:bg-red-100"}`}
              >
                {r.excluded ? "Un-exclude" : "Exclude"}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.postcode}`)}`}
                target="_blank" rel="noreferrer"
                className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Google Maps ↗
              </a>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${r.borough} restaurant`)}`}
                target="_blank" rel="noreferrer"
                className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Search web ↗
              </a>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Action
                onClick={() => { updateRestaurant(r.id, { outreachStatus: "draft_ready" }); router.push("/emails"); }}
                className="bg-brand-500 text-white hover:bg-brand-600"
              >
                Generate email draft
              </Action>
              <Action onClick={() => router.push("/emails")} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Email centre</Action>
              <Action className="bg-slate-100 text-slate-700 hover:bg-slate-200">Assign</Action>
              <Action className="bg-slate-100 text-slate-700 hover:bg-slate-200">Follow-up</Action>
              <Action
                onClick={() => updateRestaurant(r.id, { existingCustomer: !r.existingCustomer, outreachStatus: !r.existingCustomer ? "converted" : "not_contacted" })}
                className="bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                {r.existingCustomer ? "Unmark customer" : "Mark customer"}
              </Action>
              <Action
                onClick={() => updateRestaurant(r.id, { excluded: !r.excluded })}
                className="bg-red-50 text-red-700 hover:bg-red-100"
              >
                {r.excluded ? "Un-exclude" : "Not relevant"}
              </Action>
            </div>
            {r.nextAction && <p className="mt-3 text-xs text-slate-400">Next action: {r.nextAction}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{node ?? value}</dd>
    </div>
  );
}

function Action({ children, className, onClick }: { children: React.ReactNode; className: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${className}`}>
      {children}
    </button>
  );
}

// Per-venue contact log: who tried to sell to this restaurant, when, and what
// happened. Persists through the store (override on FSA venues, inline on added
// records), so the whole team sees the history.
function ContactLog({ r, onChange }: { r: Restaurant; onChange: (log: ContactNote[]) => void }) {
  const log = r.contactLog ?? [];
  const [author, setAuthor] = useState("");
  const [outcome, setOutcome] = useState<ContactOutcome>("called");
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function add() {
    const body = text.trim();
    if (!body) return;
    const note: ContactNote = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${r.id}-${log.length}-${new Date().toISOString()}`,
      author: author.trim() || "Sales team",
      text: body,
      outcome,
      at: new Date(date + "T12:00:00").toISOString(),
    };
    onChange([note, ...log]); // newest first
    setText(""); // keep author + outcome for quick repeat logging
  }

  function remove(id: string) {
    onChange(log.filter((n) => n.id !== id));
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Notes &amp; contact log</h2>
        <span className="text-xs text-slate-400">{log.length} note{log.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="flex flex-wrap gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            {(Object.keys(OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
              <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
          placeholder="What happened when you contacted them? (e.g. spoke to the manager, asked for samples, call back next week)"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">⌘/Ctrl + Enter to add</span>
          <button
            onClick={add}
            disabled={!text.trim()}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            Add note
          </button>
        </div>
      </div>

      {log.length === 0 ? (
        <p className="text-sm text-slate-400">No contact logged yet. Record calls, emails and visits here so the team can see what’s been tried.</p>
      ) : (
        <ul className="space-y-3">
          {log.map((n) => (
            <li key={n.id} className="group border-l-2 border-slate-200 pl-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {n.outcome && (
                  <span className={`rounded px-1.5 py-0.5 font-medium ${OUTCOME_STYLE[n.outcome]}`}>{OUTCOME_LABELS[n.outcome]}</span>
                )}
                <span className="font-medium text-slate-700">{n.author}</span>
                <span>·</span>
                <span>{formatWhen(n.at)}</span>
                <button
                  onClick={() => remove(n.id)}
                  className="ml-auto text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                  title="Delete note"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}
