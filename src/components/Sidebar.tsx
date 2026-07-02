"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Table2,
  Map as MapIcon,
  Sparkles,
  Mail,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Users,
  ClipboardList,
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { useRestaurants } from "@/lib/store";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Table2 },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/activity", label: "Activity", icon: ClipboardList },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/new-openings", label: "New Openings", icon: Sparkles },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { restaurants, shared, loading } = useRestaurants();
  const replies = restaurants.filter((r) => r.outreachStatus === "replied").length;

  async function handleLogout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
          LTP
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-slate-900">La Tua Pasta</p>
          <p className="text-xs text-slate-400">Prospecting</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/add"
          className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          <Plus size={16} />
          Add customer
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-50 text-brand-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {href === "/emails" && replies > 0 && (
                <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-xs font-semibold text-white">{replies}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pt-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`inline-block h-2 w-2 rounded-full ${loading ? "bg-slate-300" : shared ? "bg-green-500" : "bg-amber-400"}`} />
          {loading ? "Loading…" : shared ? "Shared team data" : "Local only (this browser)"}
        </span>
      </div>

      <button
        onClick={handleLogout}
        className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut size={18} />
        Sign out
      </button>
    </aside>
  );
}
