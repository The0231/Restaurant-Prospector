"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useRestaurants } from "@/lib/store";
import { detectChain } from "@/lib/chains";
import type { ContactNote, ContactOutcome, Restaurant } from "@/lib/types";

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

const PERIODS = [
  { label: "All time", days: null },
  { label: "Last week", days: 7 },
  { label: "Last month", days: 30 },
  { label: "Last 3 months", days: 90 },
  { label: "Last year", days: 365 },
] as const;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

type Entry = { note: ContactNote; restaurant: Restaurant };

export default function ActivityPage() {
  const { restaurants, updateRestaurant } = useRestaurants();

  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<ContactOutcome | "">("");
  const [search, setSearch] = useState("");
  const [chainOnly, setChainOnly] = useState(false);

  const allEntries = useMemo<Entry[]>(() => {
    const entries: Entry[] = [];
    for (const r of restaurants) {
      for (const note of r.contactLog ?? []) {
        entries.push({ note, restaurant: r });
      }
    }
    entries.sort((a, b) => new Date(b.note.at).getTime() - new Date(a.note.at).getTime());
    return entries;
  }, [restaurants]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return allEntries.filter(({ note, restaurant: r }) => {
      if (periodDays !== null) {
        const age = now - new Date(note.at).getTime();
        if (age > periodDays * 86_400_000) return false;
      }
      if (outcomeFilter && note.outcome !== outcomeFilter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (chainOnly && !detectChain(r.name)) return false;
      return true;
    });
  }, [allEntries, periodDays, outcomeFilter, search, chainOnly]);

  function deleteEntry(restaurant: Restaurant, noteId: string) {
    updateRestaurant(restaurant.id, {
      contactLog: (restaurant.contactLog ?? []).filter((n) => n.id !== noteId),
    });
  }

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={`${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} across all restaurants`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search restaurant…"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <select
          value={periodDays ?? ""}
          onChange={(e) => setPeriodDays(e.target.value === "" ? null : Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p.label} value={p.days ?? ""}>{p.label}</option>
          ))}
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value as ContactOutcome | "")}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All outcomes</option>
          {(Object.keys(OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
            <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={chainOnly}
            onChange={(e) => setChainOnly(e.target.checked)}
          />
          Chains
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
          {allEntries.length === 0
            ? "No contact activity logged yet. Go to a restaurant profile to add notes."
            : "No entries match your filters."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Restaurant</th>
                <th className="px-4 py-3">Cuisine · Borough</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(({ note, restaurant: r }) => (
                <tr key={note.id} className="group hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatWhen(note.at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/restaurants/${r.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.cuisineType} · {r.borough}</td>
                  <td className="px-4 py-3">
                    {note.outcome ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${OUTCOME_STYLE[note.outcome]}`}>
                        {OUTCOME_LABELS[note.outcome]}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{note.author}</td>
                  <td className="px-4 py-3 text-slate-600" title={note.text}>
                    {note.text.length > 100 ? note.text.slice(0, 100) + "…" : note.text}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete this ${note.outcome ? OUTCOME_LABELS[note.outcome].toLowerCase() : "note"} for ${r.name}?`)) {
                          deleteEntry(r, note.id);
                        }
                      }}
                      className="text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                      title="Delete entry"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
