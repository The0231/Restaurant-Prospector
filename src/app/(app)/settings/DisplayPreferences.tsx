"use client";

import { useRestaurants } from "@/lib/store";

// Interactive Display-preferences toggles. Split into its own client component
// so settings/page.tsx can stay a server component and read server-only env
// vars without a hydration mismatch.
export function DisplayPreferences() {
  const { showExcluded, setShowExcluded, londonOnly, setLondonOnly } = useRestaurants();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">London only</p>
          <p className="text-xs text-slate-400">When on, all views (leads, map, dashboard, reports) show only London venues.</p>
        </div>
        <button
          onClick={() => setLondonOnly(!londonOnly)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${londonOnly ? "bg-brand-500" : "bg-slate-200"}`}
          role="switch"
          aria-checked={londonOnly}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${londonOnly ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Show excluded venues</p>
          <p className="text-xs text-slate-400">When off, excluded and chain venues are hidden everywhere — leads, map, reports and dashboard.</p>
        </div>
        <button
          onClick={() => setShowExcluded(!showExcluded)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${showExcluded ? "bg-brand-500" : "bg-slate-200"}`}
          role="switch"
          aria-checked={showExcluded}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${showExcluded ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
    </div>
  );
}
