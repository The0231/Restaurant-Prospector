"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Redirects mobile-width browsers to the dedicated mobile map interface.
// Runs on every navigation so mobile users can't accidentally land on a desktop page.
export function MobileRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/mobile") return;
    if (window.innerWidth < 768) {
      router.replace("/mobile");
    }
  }, [pathname, router]);

  return null;
}
