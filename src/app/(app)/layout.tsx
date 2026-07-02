import { Sidebar } from "@/components/Sidebar";
import { Assistant } from "@/components/Assistant";
import { RestaurantsProvider } from "@/lib/store";
import { MobileRedirect } from "@/components/MobileRedirect";

// Shared shell for all authenticated pages. Access is enforced by middleware.ts.
// RestaurantsProvider holds the shared data for every page; the Assistant lives
// inside it so it can read and mutate the same store.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestaurantsProvider>
      <MobileRedirect />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <div className="hidden md:block"><Assistant /></div>
    </RestaurantsProvider>
  );
}
