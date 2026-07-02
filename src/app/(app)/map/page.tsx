"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/PageHeader";

// Leaflet touches `window`, so the map must be client-only (no SSR).
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-slate-400">Loading map…</div>
  ),
});

export default function MapPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Map"
        subtitle="Geographic view of all prospects, new openings and customers"
      />
      <div className="min-h-0 flex-1">
        <MapView />
      </div>
    </div>
  );
}
