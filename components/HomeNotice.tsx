"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { homeNotice } from "@/lib/site-notices";

const storageKey = `ai-trainer-notice-dismissed:${homeNotice.id}`;

function subscribeToDismissal(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getPersistedDismissal() {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export default function HomeNotice() {
  const persistedDismissal = useSyncExternalStore(subscribeToDismissal, getPersistedDismissal, () => false);
  const [sessionDismissal, setSessionDismissal] = useState(false);

  if (persistedDismissal || sessionDismissal) return null;

  function dismiss() {
    setSessionDismissal(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // 关闭动作应当即时生效，本地持久化失败不需要打扰用户。
    }
  }

  return (
    <section className="home-notice" aria-label="网站公告">
      <div className="container home-notice-row">
        <span className="home-notice-label">{homeNotice.label}</span>
        <div>
          <b>{homeNotice.title}</b>
          <p>{homeNotice.summary}</p>
        </div>
        <Link href={homeNotice.href}>{homeNotice.actionLabel}<span aria-hidden="true"> →</span></Link>
        <button type="button" onClick={dismiss} aria-label="关闭这条公告">×</button>
      </div>
    </section>
  );
}
