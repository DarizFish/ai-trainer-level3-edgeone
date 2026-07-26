"use client";

import { useEffect, useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { getPracticalReferenceNarrative } from "@/lib/practical-reference";
import { getPracticalWordDeliverable } from "@/lib/practical-word-deliverable";

export function PracticalWordDeliverable({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const deliverable = useMemo(() => getPracticalWordDeliverable(task), [task]);
  const referenceNarrative = useMemo(() => getPracticalReferenceNarrative(task), [task]);
  const [answer, setAnswer] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageKey = useMemo(() => deliverable && userEmail
    ? `ai-trainer-practical-word-response-v1:${encodeURIComponent(userEmail)}:${task.code}`
    : null, [deliverable, task.code, userEmail]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAnswer(storageKey ? (localStorage.getItem(storageKey) ?? "").slice(0, 20_000) : "");
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (restored && storageKey) localStorage.setItem(storageKey, answer.slice(0, 20_000));
  }, [answer, restored, storageKey]);

  if (!deliverable) return null;

  function requireSignIn() {
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(`/practical/${task.code}/lab`)}`);
  }

  function changeAnswer(value: string) {
    if (!userEmail) return requireSignIn();
    setAnswer(value.slice(0, 20_000));
  }

  return <section id={`lab-${deliverable.id}`} className="lab-word-deliverable business-sheet-paper notebook-word-answer-sheet" aria-label={`${deliverable.fileName} 作答区`}>
    <section className="business-sheet-section notebook-word-sheet-section">
      <header><span>WORD 答题卷</span><h2>{deliverable.fileName}</h2></header>
      <div className="notebook-word-sheet-heading">
        <h3>{deliverable.title}</h3>
      </div>
      <p className="business-sheet-prompt">{deliverable.requirement}</p>
      <label>
        <span className="sr-only">{deliverable.fileName} 作答草稿</span>
        <textarea value={answer} readOnly={!userEmail} onFocus={() => { if (!userEmail) requireSignIn(); }} onChange={(event) => changeAnswer(event.target.value)} placeholder={deliverable.placeholder} />
      </label>
      {reviewing && referenceNarrative && <section className="business-sheet-review">
        <header><span>学习复盘</span><small>完成作答后展示；非官方考场信息。</small></header>
        <p>{referenceNarrative}</p>
      </section>}
    </section>
    <footer className="notebook-word-sheet-actions">
      <div>
        <b>{answer.trim() ? "答题卷已填写" : "答题卷待填写"}</b>
      </div>
      {referenceNarrative && <button type="button" className={`button ${reviewing ? "button-quiet" : "button-primary"}`} onClick={() => setReviewing((value) => !value)}>{reviewing ? "返回作答" : "完成作答，进入复盘"}</button>}
    </footer>
  </section>;
}
