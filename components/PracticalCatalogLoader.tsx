"use client";

import { useEffect, useState } from "react";
import PracticalCatalog, { type PracticalCatalogTask } from "./PracticalCatalog";
import { contentAssets } from "@/lib/content-assets";

type PracticalCatalogBank = {
  version: string;
  tasks: PracticalCatalogTask[];
};

let cachedCatalog: PracticalCatalogBank | null = null;
let pendingCatalog: Promise<PracticalCatalogBank> | null = null;

function loadCatalog(contentVersion: string): Promise<PracticalCatalogBank> {
  if (cachedCatalog?.version === contentVersion) return Promise.resolve(cachedCatalog);
  if (!pendingCatalog) {
    pendingCatalog = fetch(contentAssets.practicalCatalog, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("实操目录加载失败");
        return await response.json() as PracticalCatalogBank;
      })
      .then((catalog) => {
        if (catalog.version !== contentVersion || !Array.isArray(catalog.tasks)) {
          throw new Error("实操目录版本不一致");
        }
        cachedCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        pendingCatalog = null;
      });
  }
  return pendingCatalog;
}

export default function PracticalCatalogLoader({ contentVersion }: { contentVersion: string }) {
  const [catalog, setCatalog] = useState<PracticalCatalogBank | null>(
    cachedCatalog?.version === contentVersion ? cachedCatalog : null,
  );
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadCatalog(contentVersion)
      .then((nextCatalog) => {
        if (!cancelled) setCatalog(nextCatalog);
      })
      .catch(() => {
        if (!cancelled) setError("实操题库暂时没有加载成功，请重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [contentVersion, retryKey]);

  if (catalog) return <PracticalCatalog tasks={catalog.tasks} />;

  return <div className="bank-loading practical-catalog-loading" role={error ? "alert" : undefined}>
    <span className="bank-loading-mark" aria-hidden>40</span>
    <div>
      <b>{error || "正在载入实操题库"}</b>
      <small>{error ? "网络恢复后可继续。" : "页面框架已就绪，目录数据只需缓存一次。"}</small>
    </div>
    {error && <button className="button button-small" type="button" onClick={() => {
      pendingCatalog = null;
      setError("");
      setRetryKey((value) => value + 1);
    }}>重新加载</button>}
  </div>;
}
