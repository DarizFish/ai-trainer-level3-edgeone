"use client";

import { useEffect, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import PracticalMock from "./PracticalMock";

type PracticalBank = {
  version: string;
  tasks: PracticalTask[];
  officialTaskCodes: string[];
};

let cachedPracticalBank: PracticalBank | null = null;
let pendingPracticalBank: Promise<PracticalBank> | null = null;

function loadPracticalBank(contentVersion: string): Promise<PracticalBank> {
  if (cachedPracticalBank?.version === contentVersion) return Promise.resolve(cachedPracticalBank);
  if (!pendingPracticalBank) {
    pendingPracticalBank = fetch(`/content/practical-${encodeURIComponent(contentVersion)}.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("实操题库加载失败");
        return await response.json() as PracticalBank;
      })
      .then((bank) => {
        if (bank.version !== contentVersion || !Array.isArray(bank.tasks)) {
          throw new Error("实操题库版本不一致");
        }
        cachedPracticalBank = bank;
        return bank;
      })
      .finally(() => {
        pendingPracticalBank = null;
      });
  }
  return pendingPracticalBank;
}

export default function PracticalMockLoader({ contentVersion }: { contentVersion: string }) {
  const [bank, setBank] = useState<PracticalBank | null>(
    cachedPracticalBank?.version === contentVersion ? cachedPracticalBank : null,
  );
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadPracticalBank(contentVersion)
      .then((nextBank) => {
        if (!cancelled) setBank(nextBank);
      })
      .catch(() => {
        if (!cancelled) setError("实操题库暂时没有加载成功，请重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [contentVersion, retryKey]);

  if (!bank) {
    return <div className="container mock-entry"><div className="bank-loading" role={error ? "alert" : undefined}>
      <span className="bank-loading-mark" aria-hidden>40</span>
      <div><b>{error || "正在载入实操考场"}</b><small>{error ? "网络恢复后可继续。" : "页面框架已就绪，实操资料只需缓存一次。"}</small></div>
      {error && <button className="button button-small" type="button" onClick={() => {
        pendingPracticalBank = null;
        setError("");
        setRetryKey((value) => value + 1);
      }}>重新加载</button>}
    </div></div>;
  }

  const taskByCode = new Map(bank.tasks.map((task) => [task.code, task]));
  const officialTasks = bank.officialTaskCodes.flatMap((code) => {
    const task = taskByCode.get(code);
    return task ? [task] : [];
  });
  return <PracticalMock allTasks={bank.tasks} officialTasks={officialTasks} contentVersion={contentVersion} />;
}
