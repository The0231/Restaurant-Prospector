"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ChainBadge, ConvertedBadge, ContactedBadge, LeadBadge, PriceTag, RecommendBadge } from "@/components/StatusBadge";
import { MultiSelect } from "@/components/MultiSelect";
import { PRICE_LABELS } from "@/lib/mock-data";
import { useRestaurants } from "@/lib/store";
import { detectChain } from "@/lib/chains";
import { getRegion, isLondon } from "@/lib/locations";
import type { LeadCategory, Restaurant } from "@/lib/types";

const PAGE_SIZE = 100;

// ── CSV export ────────────────────────────────────────────────────────────────

function escapeField(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function downloadCSV(rows: Restaurant[]) {
  const headers = [
    "Name", "Address", "Postcode", "Borough", "Cuisine",
    "Price", "Lead Score", "Category", "Outreach Status",
    "Phone", "Website", "Email", "Hygiene Rating",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.name, r.address, r.postcode, r.borough, r.cuisineType,
        PRICE_LABELS[r.priceTier], r.leadScore, r.leadCategory,
        r.outreachStatus, r.phone ?? "", r.website ?? "",
        r.email ?? "", r.hygieneRating ?? "",
      ]
        .map(escapeField)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ltp-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { restaurants, loading, focusIds, setFocusIds, viewFilter, setViewFilter, londonOnly } = useRestaurants();
  const focusSet = useMemo(() => (focusIds ? new Set(focusIds) : null), [focusIds]);
  const base = useMemo(
    () => (focusSet ? restaurants.filter((r) => focusSet.has(r.id)) : restaurants),
    [restaurants, focusSet]
  );

  // Filters
  const [search, setSearch] = useState("");
  const [boroughSel, setBoroughSel] = useState<string[]>([]);
  const [cuisineSel, setCuisineSel] = useState<string[]>([]);
  const [category, setCategory] = useState<LeadCategory | "">("");
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [onlyChains, setOnlyChains] = useState(false);
  const [page, setPage] = useState(0);

  const areaOptions = useMemo(
    () => londonOnly
      ? Array.from(new Set(restaurants.filter((r) => isLondon(r.borough)).map((r) => r.borough))).sort()
      : Array.from(new Set(restaurants.map((r) => getRegion(r.borough, r.postcode)))).sort(),
    [restaurants, londonOnly]
  );
  const cuisines = useMemo(
    () => Array.from(new Set(restaurants.map((r) => r.cuisineType))).sort(),
    [restaurants]
  );

  // Initialise filters from URL query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("cuisine")) setCuisineSel([p.get("cuisine")!]);
    if (p.get("borough")) setBoroughSel([p.get("borough")!]);
    if (p.get("text")) setSearch(p.get("text")!);
    if (p.get("score")) setCategory(p.get("score") as LeadCategory);
    if (p.get("recommended") === "1") setOnlyRecommended(true);
  }, []);

  // Apply the assistant's filter reactively
  useEffect(() => {
    if (!viewFilter) return;
    setCuisineSel(viewFilter.cuisines ?? []);
    setBoroughSel(viewFilter.boroughs ?? []);
    setSearch(viewFilter.text ?? "");
    setCategory("");
    setOnlyRecommended(!!viewFilter.recommendedOnly);
    setViewFilter(null);
  }, [viewFilter, setViewFilter]);

  // Reset area selection when toggling London/UK (options change)
  useEffect(() => { setBoroughSel([]); }, [londonOnly]);

  const rows = useMemo(() => {
    const areaLC = boroughSel.map((a) => a.toLowerCase());
    const cuisineLC = cuisineSel.map((c) => c.toLowerCase());
    const filtered = base
      .filter((r) => !r.existingCustomer)
      .filter((r) => {
        if (!areaLC.length) return true;
        if (londonOnly) return areaLC.includes(r.borough.toLowerCase());
        return areaLC.includes(getRegion(r.borough, r.postcode).toLowerCase());
      })
      .filter((r) => (cuisineLC.length ? cuisineLC.includes(r.cuisineType.toLowerCase()) : true))
      .filter((r) => (category ? r.leadCategory === category : true))
      .filter((r) => (onlyRecommended ? r.recommended : true))
      .filter((r) => (onlyChains ? detectChain(r.name) !== null : true))
      .filter((r) =>
        search
          ? `${r.name} ${r.borough} ${r.cuisineType} ${r.postcode}`
              .toLowerCase()
              .includes(search.toLowerCase())
          : true
      );
    return [...filtered].sort((a, b) => b.leadScore - a.leadScore);
  }, [base, search, boroughSel, cuisineSel, category, onlyRecommended, onlyChains, londonOnly]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Reset to page 1 when filters change
  const filterKey = `${search}|${boroughSel.join(",")}|${cuisineSel.join(",")}|${category}|${onlyRecommended}|${onlyChains}|${londonOnly}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) { setLastKey(filterKey); setPage(0); }

  return (
    <div>
      <PageHeader
        title="Lead database"
        subtitle={
          loading
            ? "Loading venues…"
            : `${rows.length.toLocaleString()} of ${restaurants.length.toLocaleString()} venues shown`
        }
        action={
          <div className="flex gap-2">
            <button
              onClick={() => downloadCSV(rows)}
              disabled={loading || rows.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download size={15} />
              Download CSV
            </button>
            <Link
              href="/add"
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              + Add customer
            </Link>
            <Link
              href="/map"
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              View on Map →
            </Link>
          </div>
        }
      />

      {focusIds && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          <span>
            Showing <b>{focusIds.length}</b> venues matched from your file.
          </span>
          <button
            onClick={() => setFocusIds(null)}
            className="font-medium text-amber-700 hover:underline"
          >
            Clear ✕
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, borough, postcode…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <MultiSelect label={londonOnly ? "Borough" : "Region"} options={areaOptions} selected={boroughSel} onChange={setBoroughSel} />
        <MultiSelect label="Cuisines" options={cuisines} selected={cuisineSel} onChange={setCuisineSel} />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LeadCategory | "")}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All scores</option>
          <option value="high">High priority</option>
          <option value="good">Good</option>
          <option value="possible">Possible</option>
          <option value="low">Low / excluded</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyRecommended} onChange={(e) => setOnlyRecommended(e.target.checked)} />
          Recommended
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyChains} onChange={(e) => setOnlyChains(e.target.checked)} />
          Chains
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">{londonOnly ? "Borough" : "Area"}</th>
              <th className="px-4 py-3">Cuisine</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Score ↓</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/restaurants/${r.id}`}
                    className="font-medium text-slate-800 hover:text-brand-600"
                  >
                    {r.name}
                  </Link>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {(r.openingStatus === "new_this_week" || r.openingStatus === "opening_soon") && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                        {r.openingStatus === "new_this_week" ? "New" : "Opening soon"}
                      </span>
                    )}
                    {detectChain(r.name) && <ChainBadge brand={detectChain(r.name)!} />}
                    {r.existingCustomer && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">Customer</span>
                    )}
                    {r.recommended && !r.existingCustomer && <RecommendBadge />}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{londonOnly ? r.borough : getRegion(r.borough, r.postcode)}</td>
                <td className="px-4 py-3 text-slate-600">{r.cuisineType}</td>
                <td className="px-4 py-3">
                  <PriceTag tier={r.priceTier} />
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">{r.leadScore}</td>
                <td className="px-4 py-3">
                  {r.existingCustomer
                    ? <ConvertedBadge />
                    : r.contactLog?.length
                      ? <ContactedBadge lastAt={r.contactLog.reduce((a, b) => a.at > b.at ? a : b).at} />
                      : <LeadBadge category={r.leadCategory} />}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.email ? (
                    <a href={`mailto:${r.email}`} className="text-brand-600 hover:underline">{r.email}</a>
                  ) : r.phone ? (
                    <a href={`tel:${r.phone}`} className="text-slate-600 hover:underline">{r.phone}</a>
                  ) : r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-600 hover:underline">
                      Website ↗
                    </a>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No restaurants match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-slate-500">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
