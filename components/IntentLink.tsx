"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type IntentLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string;
};

const prefetchedPaths = new Set<string>();
const pendingPrefetches = new Map<string, number>();

export default function IntentLink({
  href,
  onBlur,
  onClick,
  onFocus,
  onPointerLeave,
  onPointerEnter,
  onTouchStart,
  ...props
}: IntentLinkProps) {
  const router = useRouter();

  function cancelPendingPrefetch() {
    const timer = pendingPrefetches.get(href);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    pendingPrefetches.delete(href);
  }

  function schedulePrefetch() {
    if (prefetchedPaths.has(href) || pendingPrefetches.has(href)) return;
    const timer = window.setTimeout(() => {
      pendingPrefetches.delete(href);
      prefetchedPaths.add(href);
      router.prefetch(href);
    }, 80);
    pendingPrefetches.set(href, timer);
  }

  return <Link
    {...props}
    href={href}
    prefetch={false}
    onBlur={(event) => {
      onBlur?.(event);
      cancelPendingPrefetch();
    }}
    onClick={(event) => {
      cancelPendingPrefetch();
      onClick?.(event);
    }}
    onFocus={(event) => {
      onFocus?.(event);
      schedulePrefetch();
    }}
    onPointerEnter={(event) => {
      onPointerEnter?.(event);
      schedulePrefetch();
    }}
    onPointerLeave={(event) => {
      onPointerLeave?.(event);
      cancelPendingPrefetch();
    }}
    onTouchStart={(event) => {
      onTouchStart?.(event);
      schedulePrefetch();
    }}
  />;
}
