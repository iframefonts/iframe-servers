import { NextResponse, type NextRequest } from "next/server";

/** Optimistic check only: pages still verify the session with requireUser(). */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ifs_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except public pay pages, auth, APIs (webhooks, cron, inngest) and static files.
  matcher: ["/((?!pay|login|auth|api|_next|favicon.ico|.*\\.).*)"],
};
