"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hydrateVenue, type RawVenue } from "./mock-data";
import { chainKey } from "./chains";
import { isLondon } from "./locations";
import type { Restaurant } from "./types";

// Client-side data store.
//
// Base data = the real FSA dataset in public/london-restaurants.json (~20k
// venues), same for everyone. Manually-added venues + per-venue edits are the
// SHARED team state: persisted to Supabase via /api/data when configured, so
// everyone with the password sees the same pipeline. If Supabase isn't set up,
// it falls back to per-browser localStorage so the app still runs.

const STORAGE_KEY = "ltp_added_restaurants_v2";

export interface ViewFilter {
  cuisines?: string[];
  boroughs?: string[];
  text?: string;
  recommendedOnly?: boolean;
  existingCustomerOnly?: boolean;
  includeExcluded?: boolean;
}

interface StoreValue {
  restaurants: Restaurant[];
  loading: boolean;
  shared: boolean; // true when backed by the shared Supabase database
  showExcluded: boolean;
  setShowExcluded: (v: boolean) => void;
  londonOnly: boolean;
  setLondonOnly: (v: boolean) => void;
  addRestaurant: (r: Restaurant) => void;
  addRestaurants: (list: Restaurant[]) => void;
  updateRestaurant: (id: string, patch: Partial<Restaurant>) => void;
  updateMany: (patches: Record<string, Partial<Restaurant>>) => void;
  removeRestaurant: (id: string) => void;
  focusIds: string[] | null;
  setFocusIds: (ids: string[] | null) => void;
  viewFilter: ViewFilter | null;
  setViewFilter: (f: ViewFilter | null) => void;
}

const RestaurantsContext = createContext<StoreValue | null>(null);

export function RestaurantsProvider({ children }: { children: React.ReactNode }) {
  const [base, setBase] = useState<Restaurant[]>([]);
  const [baseDone, setBaseDone] = useState(false);
  const [added, setAdded] = useState<Restaurant[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Restaurant>>>({});
  const [configured, setConfigured] = useState<boolean | null>(null); // null until /api/data answers
  const [dataDone, setDataDone] = useState(false);
  const [seedCustomers, setSeedCustomers] = useState<Set<string>>(new Set());
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter | null>(null);
  const [showExcluded, setShowExcludedRaw] = useState(false);
  const [londonOnly, setLondonOnlyRaw] = useState(false);

  // Hydrate settings from localStorage
  useEffect(() => {
    try {
      const ex = localStorage.getItem("ltp_show_excluded");
      if (ex !== null) setShowExcludedRaw(JSON.parse(ex));
      const lo = localStorage.getItem("ltp_london_only");
      if (lo !== null) setLondonOnlyRaw(JSON.parse(lo));
    } catch { /* ignore */ }
  }, []);

  const setShowExcluded = useCallback((v: boolean) => {
    setShowExcludedRaw(v);
    try { localStorage.setItem("ltp_show_excluded", JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  const setLondonOnly = useCallback((v: boolean) => {
    setLondonOnlyRaw(v);
    try { localStorage.setItem("ltp_london_only", JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  // Venues matched from the LTP customer list (public/seed-customers.json) are
  // flagged as existing customers for everyone, out of the box.
  useEffect(() => {
    let cancelled = false;
    fetch("/seed-customers.json")
      .then((r) => r.json())
      .then((d: { ids?: string[] }) => {
        if (!cancelled && Array.isArray(d.ids)) setSeedCustomers(new Set(d.ids));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch + hydrate the real base dataset in chunks so the UI isn't blocked.
  // The first 3 000 venues are shown immediately (unblocks loading state);
  // the remaining ~17 k load silently in the background.
  useEffect(() => {
    let cancelled = false;
    const CHUNK = 3000;

    // Prod: Supabase Storage blob (refreshed weekly). Local dev: bundled file.
    fetch(process.env.NEXT_PUBLIC_DATASET_URL || "/uk-restaurants.json")
      .then((r) => r.json())
      .then(async (data: { venues: RawVenue[] }) => {
        if (cancelled) return;
        const all = data.venues;
        const hydrated: Restaurant[] = [];

        for (let i = 0; i < all.length; i += CHUNK) {
          if (cancelled) return;
          const batch = all.slice(i, i + CHUNK).map(hydrateVenue);
          hydrated.push(...batch);

          if (i === 0) {
            // Show first batch immediately and unblock the loading state.
            setBase([...batch]);
            setBaseDone(true);
          }

          // Yield between chunks so the browser can paint and handle events.
          await new Promise<void>((r) => setTimeout(r, 0));
        }

        // Replace with the full dataset once all chunks are processed.
        if (!cancelled) setBase(hydrated);
      })
      .catch(() => {
        if (!cancelled) setBaseDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load shared team state (Supabase) or fall back to localStorage.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/data")
      .then((r) => r.json())
      .then((d: { configured?: boolean; added?: Restaurant[]; overrides?: Record<string, Partial<Restaurant>> }) => {
        if (cancelled) return;
        if (d && d.configured) {
          setConfigured(true);
          setAdded(d.added ?? []);
          setOverrides(d.overrides ?? {});
        } else {
          setConfigured(false);
          loadLocal();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfigured(false);
          loadLocal();
        }
      })
      .finally(() => {
        if (!cancelled) setDataDone(true);
      });
    return () => {
      cancelled = true;
    };
    function loadLocal() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { added?: Restaurant[]; overrides?: Record<string, Partial<Restaurant>> };
          setAdded(p.added ?? []);
          setOverrides(p.overrides ?? {});
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Persist to localStorage ONLY in fallback mode (debounced + guarded).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (configured !== false) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ added, overrides }));
      } catch (e) {
        console.warn("LTP: could not persist to localStorage (quota?).", e);
      }
    }, 250);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [added, overrides, configured]);

  // Keep shared state fresh: refetch when the tab regains focus, and on a slow
  // interval so cron-added items (e.g. new openings) appear without a reload.
  useEffect(() => {
    if (configured !== true) return;
    const refresh = () => {
      fetch("/api/data")
        .then((r) => r.json())
        .then((d) => {
          if (d?.configured) {
            setAdded(d.added ?? []);
            setOverrides(d.overrides ?? {});
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 10 * 60 * 1000); // 10 min
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [configured]);

  // Fire a write to the shared DB (no-op in fallback mode).
  const serverPost = useCallback(
    (bodyObj: Record<string, unknown>) => {
      if (configured !== true) return;
      fetch("/api/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyObj),
      }).catch((e) => console.warn("LTP: shared save failed", e));
    },
    [configured]
  );

  const addRestaurant = useCallback(
    (r: Restaurant) => {
      setAdded((prev) => [r, ...prev.filter((p) => p.id !== r.id)]);
      serverPost({ op: "addMany", items: [r] });
    },
    [serverPost]
  );

  const addRestaurants = useCallback(
    (list: Restaurant[]) => {
      if (!list.length) return;
      setAdded((prev) => {
        const seen = new Set<string>();
        const incoming = list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        return [...incoming, ...prev.filter((p) => !seen.has(p.id))];
      });
      serverPost({ op: "addMany", items: list });
    },
    [serverPost]
  );

  const updateRestaurant = useCallback(
    (id: string, patch: Partial<Restaurant>) => {
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
      setAdded((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      serverPost({ op: "updateMany", patches: { [id]: patch } });
    },
    [serverPost]
  );

  const updateMany = useCallback(
    (patches: Record<string, Partial<Restaurant>>) => {
      const ids = Object.keys(patches);
      if (!ids.length) return;
      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { ...next[id], ...patches[id] };
        return next;
      });
      setAdded((prev) => prev.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)));
      serverPost({ op: "updateMany", patches });
    },
    [serverPost]
  );

  const removeRestaurant = useCallback(
    (id: string) => {
      setAdded((prev) => prev.filter((r) => r.id !== id));
      setOverrides((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      serverPost({ op: "remove", id });
    },
    [serverPost]
  );

  // Merge DEDUPED BY ID: added wins over base; the customer seed marks matched
  // venues as customers; user/team overrides apply last (so they can un-mark).
  const restaurants = useMemo<Restaurant[]>(() => {
    const byId = new Map<string, Restaurant>();
    for (const r of added) {
      if (byId.has(r.id)) continue;
      byId.set(r.id, overrides[r.id] ? { ...r, ...overrides[r.id] } : r);
    }
    for (const r of base) {
      if (byId.has(r.id)) continue;
      let v: Restaurant = r;
      if (seedCustomers.has(r.id)) {
        v = { ...v, existingCustomer: true, outreachStatus: v.outreachStatus === "not_contacted" ? "converted" : v.outreachStatus };
      }
      if (overrides[r.id]) v = { ...v, ...overrides[r.id] };
      byId.set(r.id, v);
    }

    // Auto-exclude chains with 5+ London locations (too large / already have suppliers).
    // A manual Un-exclude override on a specific venue still wins.
    const result = Array.from(byId.values());
    const chainCounts = new Map<string, number>();
    for (const r of result) chainCounts.set(chainKey(r.name), (chainCounts.get(chainKey(r.name)) ?? 0) + 1);
    const largeChains = new Set(Array.from(chainCounts.entries()).filter(([, n]) => n >= 5).map(([k]) => k));
    if (largeChains.size) {
      for (let i = 0; i < result.length; i++) {
        const r = result[i];
        if (!largeChains.has(chainKey(r.name))) continue;
        const manuallyUnexcluded = overrides[r.id] && overrides[r.id].excluded === false;
        const isNewOpening = r.openingStatus === "new_this_week" || r.openingStatus === "opening_soon";
        if (!manuallyUnexcluded && !isNewOpening) result[i] = { ...r, excluded: true };
      }
    }

    // Global setting: hide excluded venues entirely
    const visible = showExcluded ? result : result.filter((r) => !r.excluded);
    // Global setting: London only
    return londonOnly ? visible.filter((r) => isLondon(r.borough)) : visible;
  }, [added, base, overrides, seedCustomers, showExcluded, londonOnly]);

  const loading = !baseDone || !dataDone;

  const value = useMemo(
    () => ({
      restaurants,
      loading,
      shared: configured === true,
      showExcluded,
      setShowExcluded,
      londonOnly,
      setLondonOnly,
      addRestaurant,
      addRestaurants,
      updateRestaurant,
      updateMany,
      removeRestaurant,
      focusIds,
      setFocusIds,
      viewFilter,
      setViewFilter,
    }),
    [restaurants, loading, configured, showExcluded, setShowExcluded, londonOnly, setLondonOnly, addRestaurant, addRestaurants, updateRestaurant, updateMany, removeRestaurant, focusIds, viewFilter]
  );

  return <RestaurantsContext.Provider value={value}>{children}</RestaurantsContext.Provider>;
}

export function useRestaurants(): StoreValue {
  const ctx = useContext(RestaurantsContext);
  if (!ctx) throw new Error("useRestaurants must be used within RestaurantsProvider");
  return ctx;
}
