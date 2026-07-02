"use client";

import dynamic from "next/dynamic";

// MobileMapView uses Leaflet which requires browser APIs — disable SSR.
const MobileMapView = dynamic(
  () => import("@/components/MobileMapView").then((m) => ({ default: m.MobileMapView })),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <p className="text-sm text-slate-400">Loading map...</p>
      </div>
    ),
  }
);

export default function MobilePage() {
  return <MobileMapView />;
}
