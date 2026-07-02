"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { DELIVERY_CENTER, DELIVERY_RADIUS_KM } from "@/lib/mock-data";
import { useRestaurants } from "@/lib/store";
import { isLondon } from "@/lib/locations";
import type { PinStatus, Restaurant } from "@/lib/types";

const PIN_COLOURS: Record<PinStatus, string> = {
  existing_customer: "#2563eb", // blue
  high:              "#16a34a", // green
  new_opening:       "#9333ea", // purple
  medium:            "#f59e0b", // amber
  low:               "#ef4444", // red
  excluded:          "#9ca3af", // grey (hidden by default)
  closed:            "#374151", // dark grey (hidden by default)
};

const PIN_LABELS: Record<PinStatus, string> = {
  existing_customer: "Existing LTP customer",
  high:              "High priority",
  new_opening:       "New opening",
  medium:            "Medium priority",
  low:               "Low priority",
  excluded:          "Excluded",
  closed:            "Closed / invalid",
};

function pinStatus(r: Restaurant): PinStatus {
  if (r.openingStatus === "closed") return "closed";
  if (r.existingCustomer) return "existing_customer";
  if (r.openingStatus === "new_this_week" || r.openingStatus === "opening_soon") return "new_opening";
  if (r.excluded) return "excluded";
  if (r.leadCategory === "high") return "high";
  if (r.leadCategory === "good" || r.leadCategory === "possible") return "medium";
  return "low";
}

// Smooth red → orange → yellow → green spectrum.
// Maps the realistic visible range (35–90) across the full hue arc so clusters
// don't bunch at the green end when low-scoring venues are hidden.
function scoreToColor(avg: number): string {
  const s = Math.max(41, Math.min(69, avg));
  const hue = Math.round(((s - 41) / 28) * 120); // 41→0°(red), 55→60°(yellow), 69→120°(green)
  return `hsl(${hue}, 80%, 38%)`;
}

const UK_CENTRE: [number, number] = [54.5, -3.5];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function popupHtml(r: Restaurant, status: PinStatus): string {
  const contact = r.email ? `<p style="margin:2px 0;color:#64748b">${esc(r.email)}</p>` : "";
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " " + r.postcode)}`;
  const excludeBtn = r.excluded
    ? `<button onclick="window.__ltpExclude('${r.id}',false)" style="background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:4px;font-size:12px;border:none;cursor:pointer">Un-exclude</button>`
    : `<button onclick="window.__ltpExclude('${r.id}',true)" style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:4px;font-size:12px;border:none;cursor:pointer">Exclude</button>`;
  return `
    <div style="min-width:200px">
      <p style="margin:0;font-weight:600;color:#0f172a">${esc(r.name)}</p>
      <p style="margin:2px 0;color:#64748b;font-size:12px">${esc(r.cuisineType)} · ${esc(r.borough)}</p>
      <p style="margin:2px 0;font-size:12px">Score <b>${r.leadScore}</b> · ${PIN_LABELS[status]}</p>
      ${contact}
      <p style="margin:2px 0;font-size:12px;color:#475569">${esc(r.scoreReason)}</p>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        <a href="/restaurants/${r.id}" style="background:#b91c1c;color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;text-decoration:none">Open profile</a>
        <a href="${maps}" target="_blank" rel="noreferrer" style="background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:4px;font-size:12px;text-decoration:none">Maps</a>
        ${excludeBtn}
      </div>
    </div>`;
}

function ClusterLayer({
  pins,
  onExclude,
}: {
  pins: { r: Restaurant; status: PinStatus }[];
  onExclude: (id: string, excluded: boolean) => void;
}) {
  const map = useMap();
  const onExcludeRef = useRef(onExclude);
  onExcludeRef.current = onExclude;

  useEffect(() => {
    (window as any).__ltpExclude = (id: string, excluded: boolean) =>
      onExcludeRef.current(id, excluded);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group = (L as any).markerClusterGroup({
      chunkedLoading: false,
      maxClusterRadius: 55,
      disableClusteringAtZoom: 17,
      iconCreateFunction: (cluster: any) => {
        const children: any[] = cluster.getAllChildMarkers();
        const scores: number[] = children.filter((m) => !m.options.pinIsCustomer).map((m) => m.options.pinScore ?? 50);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;
        const color = scoreToColor(avg);
        const count = cluster.getChildCount();
        // size grows with count
        const inner = count < 10 ? 28 : count < 50 ? 34 : count < 200 ? 40 : 46;
        const outer = inner + 10; // translucent ring adds 5px each side
        return L.divIcon({
          html: `<div style="position:relative;width:${outer}px;height:${outer}px;display:flex;align-items:center;justify-content:center">
            <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25"></div>
            <div style="position:relative;width:${inner}px;height:${inner}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.85);color:white;font-weight:700;font-size:${inner <= 28 ? 11 : 12}px;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${count}</div>
          </div>`,
          className: "",
          iconSize: L.point(outer, outer),
          iconAnchor: L.point(outer / 2, outer / 2),
        });
      },
    });

    for (const { r, status } of pins) {
      const m = L.circleMarker([r.latitude, r.longitude], {
        radius: 7,
        color: "#ffffff",
        weight: 1.5,
        fillColor: PIN_COLOURS[status],
        fillOpacity: 0.85,
        pinScore: r.leadScore,
        pinIsCustomer: status === "existing_customer",
      } as any);
      m.bindPopup(popupHtml(r, status));
      group.addLayer(m);
    }

    map.addLayer(group);
    return () => {
      try { group.clearLayers(); } catch { /* ignore */ }
      try { map.removeLayer(group); } catch { /* map may already be unmounted */ }
      delete (window as any).__ltpExclude;
    };
  }, [pins, map]);

  return null;
}

export default function MapView() {
  const { restaurants, loading, updateRestaurant, focusIds, setFocusIds, viewFilter, setViewFilter, londonOnly } =
    useRestaurants();

  // Default: excluded and closed are hidden
  const [activeStatuses, setActiveStatuses] = useState<Set<PinStatus>>(
    new Set((Object.keys(PIN_COLOURS) as PinStatus[]).filter((s) => s !== "excluded" && s !== "closed"))
  );
  const [showDelivery, setShowDelivery] = useState(true);
  const [query, setQuery] = useState("");
  const [vfCuisines, setVfCuisines] = useState<string[]>([]);
  const [vfBoroughs, setVfBoroughs] = useState<string[]>([]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("cuisine")) setVfCuisines([p.get("cuisine")!]);
    if (p.get("text")) setQuery(p.get("text")!);
  }, []);

  useEffect(() => {
    if (!viewFilter) return;
    setVfCuisines(viewFilter.cuisines ?? []);
    setVfBoroughs(viewFilter.boroughs ?? []);
    setQuery(viewFilter.text ?? "");
    setViewFilter(null);
  }, [viewFilter, setViewFilter]);

  function toggle(status: PinStatus) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const pins = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cz = vfCuisines.map((c) => c.toLowerCase());
    const bz = vfBoroughs.map((b) => b.toLowerCase());
    const focusSet = focusIds ? new Set(focusIds) : null;
    const sourceList = focusSet ? restaurants.filter((r) => focusSet.has(r.id)) : restaurants;
    return sourceList
      .map((r) => ({ r, status: pinStatus(r) }))
      .filter(({ r, status }) => {
        if (!activeStatuses.has(status)) return false;
        if (cz.length && !cz.includes(r.cuisineType.toLowerCase())) return false;
        if (bz.length && !bz.includes(r.borough.toLowerCase())) return false;
        if (q && !`${r.name} ${r.borough} ${r.cuisineType} ${r.postcode}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [restaurants, activeStatuses, query, vfCuisines, vfBoroughs, focusIds]);

  return (
    <div className="flex h-full gap-4">
      <div className="w-56 shrink-0 space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Search</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name, cuisine, borough…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          {(vfCuisines.length > 0 || vfBoroughs.length > 0) && (
            <button
              onClick={() => { setVfCuisines([]); setVfBoroughs([]); }}
              className="mt-1 block text-left text-xs text-brand-600 hover:underline"
            >
              {[...vfCuisines, ...vfBoroughs].join(", ")} ✕
            </button>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pin status</h3>
          <div className="space-y-1.5">
            {(Object.keys(PIN_COLOURS) as PinStatus[]).map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={activeStatuses.has(s)} onChange={() => toggle(s)} />
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PIN_COLOURS[s] }} />
                {PIN_LABELS[s]}
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Overlays</h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showDelivery} onChange={(e) => setShowDelivery(e.target.checked)} />
            Delivery area
          </label>
        </div>

        {focusIds && (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {focusIds.length} from your file
            <button onClick={() => setFocusIds(null)} className="ml-1 font-medium text-amber-700 hover:underline">
              clear ✕
            </button>
          </div>
        )}

        <p className="text-xs text-slate-400">
          {loading ? "Loading venues…" : `${pins.length.toLocaleString()} venues shown`}
        </p>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
        {/* No preferCanvas — conflicts with markercluster circleMarker lifecycle */}
        <MapContainer center={UK_CENTRE} zoom={6} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {showDelivery && (
            <Circle
              center={DELIVERY_CENTER}
              radius={DELIVERY_RADIUS_KM * 1000}
              pathOptions={{ color: "#b91c1c", fillColor: "#b91c1c", fillOpacity: 0.05 }}
            />
          )}
          <ClusterLayer
            pins={pins}
            onExclude={(id, excluded) => updateRestaurant(id, { excluded })}
          />
        </MapContainer>
      </div>
    </div>
  );
}
