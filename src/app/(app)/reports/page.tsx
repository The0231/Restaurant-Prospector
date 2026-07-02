"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { PRICE_LABELS, funnelCounts } from "@/lib/mock-data";
import { useRestaurants } from "@/lib/store";
import type { PriceTier, Restaurant } from "@/lib/types";

export default function ReportsPage() {
  const { restaurants, loading } = useRestaurants();
  const f = useMemo(() => funnelCounts(restaurants), [restaurants]);

  const fitSegments = useMemo(() => {
    let recommended = 0, otherFit = 0, excluded = 0;
    for (const r of restaurants) {
      if (r.excluded) excluded++;
      else if (r.recommended) recommended++;
      else otherFit++;
    }
    return [
      { label: "Best fits", value: recommended, color: "#16a34a" },
      { label: "Possible fits", value: otherFit, color: "#d97706" },
      { label: "Not a fit", value: excluded, color: "#dc2626" },
    ];
  }, [restaurants]);

  const byCuisine = useMemo(() => topCounts(restaurants.filter((r) => !r.excluded), (r) => r.cuisineType, 10), [restaurants]);
  const byBorough = useMemo(() => topCounts(restaurants.filter((r) => !r.excluded), (r) => r.borough, 10), [restaurants]);
  const customerBorough = useMemo(() => topCounts(restaurants.filter((r) => r.existingCustomer), (r) => r.borough, 8), [restaurants]);

  const byPrice = useMemo(() => {
    const counts: Record<PriceTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of restaurants) if (!r.excluded) counts[r.priceTier]++;
    return ([1, 2, 3, 4] as PriceTier[]).map((t) => ({ label: PRICE_LABELS[t], value: counts[t] }));
  }, [restaurants]);

  const outreach = useMemo(() => {
    const order: { key: Restaurant["outreachStatus"]; label: string; color: string }[] = [
      { key: "not_contacted", label: "Not contacted", color: "#94a3b8" },
      { key: "draft_ready", label: "Draft ready", color: "#6366f1" },
      { key: "scheduled", label: "Scheduled", color: "#9333ea" },
      { key: "sent", label: "Sent", color: "#2563eb" },
      { key: "replied", label: "Replied", color: "#0d9488" },
      { key: "converted", label: "Converted", color: "#16a34a" },
    ];
    const counts: Record<string, number> = {};
    for (const r of restaurants) if (!r.excluded || r.existingCustomer) counts[r.outreachStatus] = (counts[r.outreachStatus] ?? 0) + 1;
    return order.map((o) => ({ ...o, value: counts[o.key] ?? 0 })).filter((o) => o.value > 0);
  }, [restaurants]);

  return (
    <div>
      <PageHeader title="Reports" subtitle={loading ? "Loading…" : "Pipeline, fit and outreach metrics across your UK database"} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Venues" value={loading ? "…" : f.total.toLocaleString()} />
        <StatCard label="Best fits" value={f.recommended.toLocaleString()} accent="green" />
        <StatCard label="Customers" value={f.customers} accent="blue" />
        <StatCard label="Drafts" value={restaurants.filter((r) => r.outreachStatus === "draft_ready").length} accent="purple" />
        <StatCard label="Replies" value={f.replied} accent="amber" />
        <StatCard label="Converted" value={f.converted} accent="green" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Fit donut */}
        <Card title="Fit breakdown" hint="cuisine + price">
          <div className="flex items-center gap-6">
            <Donut segments={fitSegments} />
            <ul className="space-y-2 text-sm">
              {fitSegments.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-600">{s.label}</span>
                  <span className="font-semibold text-slate-900">{s.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Outreach pipeline */}
        <Card title="Outreach status">
          {outreach.length === 0 ? (
            <Empty>No outreach activity yet. Generate drafts from the Email centre.</Empty>
          ) : (
            <div className="space-y-2">
              {outreach.map((o) => (
                <BarRow key={o.key} label={o.label} value={o.value} max={Math.max(...outreach.map((x) => x.value))} color={o.color} />
              ))}
            </div>
          )}
        </Card>

        {/* Cuisine distribution */}
        <Card title="Top cuisines (worth contacting)">
          <div className="space-y-2">
            {byCuisine.map((c) => (
              <BarRow key={c.label} label={c.label} value={c.value} max={byCuisine[0]?.value ?? 1} />
            ))}
          </div>
        </Card>

        {/* Price tiers */}
        <Card title="Price point distribution">
          <div className="space-y-2">
            {byPrice.map((p) => (
              <BarRow key={p.label} label={p.label} value={p.value} max={Math.max(...byPrice.map((x) => x.value), 1)} />
            ))}
          </div>
        </Card>

        {/* Prospects by borough */}
        <Card title="Prospects by borough">
          <div className="space-y-2">
            {byBorough.map((b) => (
              <BarRow key={b.label} label={b.label} value={b.value} max={byBorough[0]?.value ?? 1} />
            ))}
          </div>
        </Card>

        {/* Customers by borough */}
        <Card title="Customers by borough">
          {customerBorough.length === 0 ? (
            <Empty>No customers yet — add some to see where they cluster.</Empty>
          ) : (
            <div className="space-y-2">
              {customerBorough.map((b) => (
                <BarRow key={b.label} label={b.label} value={b.value} max={customerBorough[0]?.value ?? 1} color="#2563eb" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Reply &amp; conversion figures update as you mark outreach in the Email centre. Automatic reply detection (inbound email) comes with the email-provider integration.
      </p>
    </div>
  );
}

// ---- helpers ----

function topCounts(items: Restaurant[], key: (r: Restaurant) => string, limit: number) {
  const counts: Record<string, number> = {};
  for (const r of items) counts[key(r)] = (counts[key(r)] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }));
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

function BarRow({ label, value, max, color = "#b91c1c" }: { label: string; value: number; max: number; color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 truncate text-sm text-slate-600" title={label}>{label}</div>
      <div className="h-5 flex-1 rounded bg-slate-100">
        <div className="flex h-5 items-center justify-end rounded pr-2 text-xs font-medium text-white" style={{ width: `${Math.max((value / max) * 100, 6)}%`, backgroundColor: color }}>
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {segments.map((s) => {
        const frac = s.value / total;
        const dash = frac * c;
        const el = (
          <circle
            key={s.label}
            cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
          />
        );
        offset += dash;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" className="fill-slate-900 text-lg font-bold">{Math.round((segments[0].value / total) * 100)}%</text>
      <text x="70" y="84" textAnchor="middle" className="fill-slate-400 text-[10px]">best fits</text>
    </svg>
  );
}
