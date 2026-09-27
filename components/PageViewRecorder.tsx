"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportBrowserEvent } from "@/lib/analytics-client";
import { pageRouteId } from "@/lib/analytics-events";

export default function PageViewRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    const routeId = pageRouteId(pathname);
    if (routeId) reportBrowserEvent({ event_name: "page.viewed", route_id: routeId, occurred_at: new Date().toISOString() });
  }, [pathname]);
  return null;
}
