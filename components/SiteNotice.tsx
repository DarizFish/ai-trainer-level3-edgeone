"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteNotice } from "@/lib/site-notices";

const offeredNotices = new Set<string>();
const storageKey = `ai-trainer-notice-seen:${siteNotice.id}`;

function wasSeen() {
  if (offeredNotices.has(siteNotice.id)) return true;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      if (window[name].getItem(storageKey) === "1") return true;
    } catch {
      // 浏览器可能禁用存储；仍可在本次站内浏览中去重。
    }
  }
  return false;
}

function NoticeVisit({ pathname }: { pathname: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || wasSeen()) return;
      offeredNotices.add(siteNotice.id);
      for (const name of ["localStorage", "sessionStorage"] as const) {
        try {
          window[name].setItem(storageKey, "1");
        } catch {
          // 持久化失败不影响浏览和关闭公告。
        }
      }
      if (pathname !== siteNotice.href) setVisible(true);
    });
    return () => { active = false; };
  }, [pathname]);

  if (!visible) return null;

  return (
    <section className="site-notice" aria-label="网站公告">
      <div className="container site-notice-row">
        <span className="site-notice-label">{siteNotice.label}</span>
        <p><b>{siteNotice.title}</b><span>{siteNotice.summary}</span></p>
        <Link href={siteNotice.href} onClick={() => setVisible(false)}>{siteNotice.actionLabel}<span aria-hidden="true"> →</span></Link>
        <button type="button" onClick={() => setVisible(false)} aria-label="关闭这条公告">×</button>
      </div>
    </section>
  );
}

export default function SiteNotice() {
  const pathname = usePathname();
  // 路由离开后销毁本次提示，返回原页面也不会重新出现。
  return <NoticeVisit key={pathname} pathname={pathname} />;
}
