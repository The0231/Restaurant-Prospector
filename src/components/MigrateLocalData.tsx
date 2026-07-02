"use client";

import { useEffect, useState } from "react";
import { useRestaurants } from "@/lib/store";
import type { Restaurant } from "@/lib/types";

const STORAGE_KEY = "ltp_added_restaurants_v2";
const MIGRATED_FLAG = "ltp_added_restaurants_v2_migrated_at";

interface LocalData {
  added: Restaurant[];
  overrides: Record<string, Partial<Restaurant>>;
}

function readLocalData(): LocalData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LocalData>;
    const added = p.added ?? [];
    const overrides = p.overrides ?? {};
    if (added.length === 0 && Object.keys(overrides).length === 0) return null;
    return { added, overrides };
  } catch {
    return null;
  }
}

// Once the shared database is connected, the app stops reading this browser's
// localStorage entirely — so any venues/notes entered here while running in
// offline mode would otherwise be silently left behind. This lets whoever's
// on THIS device push that leftover data up to Supabase once, per browser.
export function MigrateLocalData() {
  const { shared, addRestaurants, updateMany } = useRestaurants();
  const [local, setLocal] = useState<LocalData | null>(null);
  const [migratedAt, setMigratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLocal(readLocalData());
    try { setMigratedAt(localStorage.getItem(MIGRATED_FLAG)); } catch { /* ignore */ }
  }, []);

  if (!shared || !local || done) return null;

  const addedCount = local.added.length;
  const overrideCount = Object.keys(local.overrides).length;

  function migrate() {
    if (!local) return;
    setBusy(true);
    if (local.added.length) addRestaurants(local.added);
    if (Object.keys(local.overrides).length) updateMany(local.overrides);
    try { localStorage.setItem(MIGRATED_FLAG, new Date().toISOString()); } catch { /* ignore */ }
    setBusy(false);
    setDone(true);
  }

  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
      <p className="text-sm font-semibold text-amber-900">Local data found on this device</p>
      <p className="mt-1 text-xs text-amber-700">
        {addedCount > 0 && `${addedCount} added venue${addedCount === 1 ? "" : "s"}`}
        {addedCount > 0 && overrideCount > 0 && " and "}
        {overrideCount > 0 && `${overrideCount} edited venue${overrideCount === 1 ? "" : "s"} (notes, flags, etc.)`}
        {" "}was saved here before the shared database was connected. It won&apos;t appear for the team until you push it up.
      </p>
      {migratedAt && (
        <p className="mt-1 text-[11px] text-amber-600">
          Already migrated once on {new Date(migratedAt).toLocaleString("en-GB")} — safe to run again, it won&apos;t duplicate.
        </p>
      )}
      <button
        onClick={migrate}
        disabled={busy}
        className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {busy ? "Migrating…" : "Migrate to shared database"}
      </button>
    </div>
  );
}
