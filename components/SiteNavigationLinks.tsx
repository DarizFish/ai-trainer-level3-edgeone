"use client";

import { usePathname } from "next/navigation";
import IntentLink from "./IntentLink";

type NavigationItem = readonly [label: string, href: string];

export default function SiteNavigationLinks({
  items,
  showArrows = false,
}: {
  items: readonly NavigationItem[];
  showArrows?: boolean;
}) {
  const pathname = usePathname();
  const activeHref = items
    .map(([, href]) => href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right.length - left.length)[0];

  return items.map(([label, href]) => {
    const active = href === activeHref;
    return <IntentLink
      href={href}
      key={href}
      className={active ? "active" : undefined}
      aria-current={active ? "page" : undefined}
    >
      {label}{showArrows && <span aria-hidden="true">→</span>}
    </IntentLink>;
  });
}
