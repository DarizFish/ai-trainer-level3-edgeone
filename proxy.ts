import { NextResponse, type NextRequest } from "next/server";
import { practicalMockEnabled, voluntarySupportEnabled } from "@/lib/features";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/support")) {
    if (!voluntarySupportEnabled) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (!practicalMockEnabled) {
    return NextResponse.redirect(new URL("/practical", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/practical/mock/:path*", "/support/:path*"],
};
