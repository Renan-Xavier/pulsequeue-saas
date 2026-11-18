import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 optimistic session cookie gate for authenticated tenant routes.
 * Full session validation and RBAC checks run in Server Components and Route Handlers.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/webhooks/:path*", "/auditoria/:path*"],
};
