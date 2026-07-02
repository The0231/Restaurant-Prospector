"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { useRestaurants } from "@/lib/store";
import { CUISINES, PRICE_LABELS, makeRestaurant, scoreRestaurant } from "@/lib/mock-data";
import type { PriceTier, Restaurant } from "@/lib/types";

const BUSINESS_TYPES = ["Restaurant", "Hotel restaurant", "Gastro-pub", "Deli / Food hall", "Caterer", "Farm shop", "Bistro", "Trattoria"];

const BOROUGH_CENTERS: Record<string, [number, number]> = {
  Westminster: [51.4975, -0.1357], Camden: [51.539, -0.1426], Islington: [51.5362, -0.1031],
  Hackney: [51.545, -0.0553], "Tower Hamlets": [51.5203, -0.0293], Southwark: [51.503, -0.09],
  Lambeth: [51.4607, -0.1163], Wandsworth: [51.457, -0.191], "Kensington and Chelsea": [51.4991, -0.1938],
  "Hammersmith and Fulham": [51.4927, -0.224], "City of London": [51.5155, -0.0922], Greenwich: [51.4826, -0.0077],
};

export default function AddPage() {
  const router = useRouter();
  const { restaurants, addRestaurant, updateRestaurant } = useRestaurants();

  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Restaurant | null>(null);
  const [form, setForm] = useState({
    name: "", address: "", postcode: "", borough: "Westminster",
    cuisineType: "Italian", businessType: "Restaurant", priceTier: 3 as PriceTier,
    email: "", phone: "", website: "", existingCustomer: true,
    latitude: 51.5095, longitude: -0.1265,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Search known venues (only real FSA venues, not already-added).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Restaurant[] = [];
    for (const r of restaurants) {
      if (`${r.name} ${r.postcode} ${r.borough}`.toLowerCase().includes(q)) {
        out.push(r);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [restaurants, search]);

  function pick(r: Restaurant) {
    setPicked(r);
    setSearch(r.name);
    setForm((f) => ({
      ...f,
      name: r.name, address: r.address, postcode: r.postcode, borough: r.borough,
      cuisineType: r.cuisineType, priceTier: r.priceTier,
      latitude: r.latitude, longitude: r.longitude,
      email: r.email ?? "", phone: r.phone ?? "", website: r.website ?? "",
    }));
  }

  const preview = scoreRestaurant(form.cuisineType, form.priceTier);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    let lat = form.latitude, lng = form.longitude;
    if (!picked) {
      const c = BOROUGH_CENTERS[form.borough] ?? [51.5095, -0.1265];
      lat = c[0] + (Math.random() - 0.5) * 0.02;
      lng = c[1] + (Math.random() - 0.5) * 0.03;
    }
    const built = makeRestaurant({
      id: picked ? picked.id : undefined,
      name: form.name.trim(), address: form.address.trim() || form.borough, postcode: form.postcode.trim(),
      borough: form.borough, latitude: lat, longitude: lng,
      cuisineType: form.cuisineType, businessType: form.businessType, priceTier: form.priceTier,
      email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, website: form.website.trim() || undefined,
      existingCustomer: form.existingCustomer,
    });
    if (picked) {
      // Known FSA venue → override it in place (NO duplicate record).
      const { id, ...patch } = built;
      void id;
      updateRestaurant(picked.id, patch);
      router.push(`/restaurants/${picked.id}`);
    } else {
      addRestaurant(built);
      router.push(`/restaurants/${built.id}`);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add customer / restaurant"
        subtitle="Search the UK database and pick a known venue, or enter one manually. Compatibility is scored on cuisine + price."
      />

      {/* Known-venue picker */}
      <div className="mb-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <label className="mb-1 block text-xs font-medium text-slate-500">Find a known venue</label>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
          placeholder="Start typing a restaurant name or postcode…"
          className={input}
        />
        {matches.length > 0 && !picked && (
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {matches.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span><span className="font-medium text-slate-800">{r.name}</span> <span className="text-slate-400">· {r.cuisineType}</span></span>
                  <span className="text-xs text-slate-400">{r.borough} · {r.postcode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && <p className="mt-2 text-xs text-green-700">✓ Selected a known venue — details prefilled below. Adjust cuisine/price if needed.</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <label className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-800">
            <input type="checkbox" checked={form.existingCustomer} onChange={(e) => set("existingCustomer", e.target.checked)} />
            This is an existing La Tua Pasta customer
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Restaurant name *"><input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Trattoria Soho" /></Field>
            <Field label="Borough">
              <select className={input} value={form.borough} onChange={(e) => set("borough", e.target.value)}>
                {Object.keys(BOROUGH_CENTERS).map((b) => (<option key={b}>{b}</option>))}
                {!Object.keys(BOROUGH_CENTERS).includes(form.borough) && <option>{form.borough}</option>}
              </select>
            </Field>
            <Field label="Address"><input className={input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" /></Field>
            <Field label="Postcode"><input className={input} value={form.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="W1D 4DP" /></Field>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Compatibility (cuisine + price)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cuisine">
              <select className={input} value={form.cuisineType} onChange={(e) => set("cuisineType", e.target.value)}>
                {CUISINES.map((c) => (<option key={c.name}>{c.name}</option>))}
              </select>
            </Field>
            <Field label="Price point">
              <select className={input} value={form.priceTier} onChange={(e) => set("priceTier", Number(e.target.value) as PriceTier)}>
                {([1, 2, 3, 4] as PriceTier[]).map((t) => (<option key={t} value={t}>{PRICE_LABELS[t]}</option>))}
              </select>
            </Field>
            <Field label="Business type">
              <select className={input} value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
                {BUSINESS_TYPES.map((b) => (<option key={b}>{b}</option>))}
              </select>
            </Field>
          </div>
          <div className={`mt-4 rounded-lg p-3 text-sm ${preview.recommended ? "bg-green-50 text-green-800" : "bg-slate-50 text-slate-600"}`}>
            <span className="font-semibold">Score {preview.leadScore}/100</span>
            {preview.recommended ? " · ✓ Recommended" : " · Not recommended"}
            <p className="mt-1 text-xs">{preview.scoreReason}</p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Contact details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email"><input className={input} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="trade@…" /></Field>
            <Field label="Phone"><input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 …" /></Field>
            <Field label="Website"><input className={input} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></Field>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">Save {form.existingCustomer ? "customer" : "restaurant"}</button>
          <button type="button" onClick={() => router.back()} className="rounded-lg bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
