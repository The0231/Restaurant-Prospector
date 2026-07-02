import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Server-side route guard. Any route that is not public requires the session
// cookie; otherwise the user is redirected to /login. This is the seam where
// you plug in real session verification (e.g. validate a Supabase JWT here).

// /api/sync-customers is a Vercel Cron endpoint — it has no session cookie, so
// it must bypass the login gate. It protects itself with CRON_SECRET instead.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/sync-customers"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Logged-in user visiting /login -> send to dashboard.
  if (isPublic && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated user on a protected route -> send to login.
  if (!isPublic && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
