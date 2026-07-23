"use client";

import { useEffect, useState } from "react";
import type { TheoryQuestion } from "@/lib/content";
import TheoryPractice from "./TheoryPractice";
import TheoryMock from "./TheoryMock";

type TheoryBank = {
  version: string;
  questions: TheoryQuestion[];
  officialQuestionIds: string[];
};

let cachedTheoryBank: TheoryBank | null = null;
let pendingTheoryBank: Promise<TheoryBank> | null = null;

function loadTheoryBank(contentVersion: string): Promise<TheoryBank> {
  if (cachedTheoryBank?.version === contentVersion) return Promise.resolve(cachedTheoryBank);
  if (!pendingTheoryBank) {
    pendingTheoryBank = fetch(`/content/theory-${encodeURIComponent(contentVersion)}.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("题库加载失败");
        return await response.json() as TheoryBank;
      })
      .then((bank) => {
        if (bank.version !== contentVersion || !Array.isArray(bank.questions)) {
          throw new Error("题库版本不一致");
        }
        cachedTheoryBank = bank;
        return bank;
      })
      .finally(() => {
        pendingTheoryBank = null;
      });
  }
  return pendingTheoryBank;
}

function useTheoryBank(contentVersion: string) {
  const [bank, setBank] = useState<TheoryBank | null>(
    cachedTheoryBank?.version === contentVersion ? cachedTheoryBank : null,
  );
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadTheoryBank(contentVersion)
      .then((nextBank) => {
        if (!cancelled) setBank(nextBank);
      })
      .catch(() => {
        if (!cancelled) setError("题库暂时没有加载成功，请重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [contentVersion, retryKey]);

  return {
    bank,
    error,
    retry: () => {
      pendingTheoryBank = null;
      setError("");
      setRetryKey((value) => value + 1);
    },
  };
}

function TheoryBankLoading({ error, retry }: { error: string; retry: () => void }) {
  if (error) {
    return <div className="bank-loading bank-loading-error" role="alert">
      <b>{error}</b>
      <button className="button button-small" type="button" onClick={retry}>重新加载</button>
    </div>;
  }

  return <div className="bank-loading" aria-live="polite">
    <span className="bank-loading-mark" aria-hidden>900</span>
    <div><b>正在载入题库</b><small>页面框架已就绪，题库只需缓存一次。</small></div>
  </div>;
}

export function TheoryPracticeLoader({ contentVersion }: { contentVersion: string }) {
  const { bank, error, retry } = useTheoryBank(contentVersion);
  return bank
    ? <TheoryPractice questions={bank.questions} contentVersion={contentVersion} />
    : <TheoryBankLoading error={error} retry={retry} />;
}

export function TheoryMockLoader({ contentVersion }: { contentVersion: string }) {
  const { bank, error, retry } = useTheoryBank(contentVersion);
  if (!bank) return <div className="container mock-entry"><TheoryBankLoading error={error} retry={retry} /></div>;

  const questionById = new Map(bank.questions.map((question) => [question.id, question]));
  const officialQuestions = bank.officialQuestionIds.flatMap((id) => {
    const question = questionById.get(id);
    return question ? [question] : [];
  });
  return <TheoryMock allQuestions={bank.questions} officialQuestions={officialQuestions} contentVersion={contentVersion} />;
}
