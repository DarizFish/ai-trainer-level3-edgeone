import { NextResponse, type NextRequest } from "next/server";
import { practicalMockEnabled } from "@/lib/features";

export function proxy(request: NextRequest) {
  if (!practicalMockEnabled) {
    return NextResponse.redirect(new URL("/practical", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/practical/mock/:path*"],
};
