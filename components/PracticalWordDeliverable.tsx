"use client";

import { useEffect, useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { getPracticalReferenceNarrative } from "@/lib/practical-reference";
import { getPracticalWordDeliverable } from "@/lib/practical-word-deliverable";
import { SourceBadge } from "./SourceBadge";

export function PracticalWordDeliverable({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const deliverable = useMemo(() => getPracticalWordDeliverable(task), [task]);
  const referenceNarrative = useMemo(() => getPracticalReferenceNarrative(task), [task]);
  const [answer, setAnswer] = useState("");
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

  return <section id={`lab-${deliverable.id}`} className="lab-word-deliverable" aria-label={`${deliverable.fileName} 作答区`}>
    <header>
      <div><p className="eyebrow">WORD 答题卷</p><h2>{deliverable.title}</h2><p>这部分是独立的文字交付物，不写入 Notebook。</p></div>
      <b>{deliverable.fileName}</b>
    </header>
    <details className="lab-word-requirement">
      <summary>查看该答题卷的官方要求</summary>
      <p>{deliverable.requirement}</p>
    </details>
    <label>
      <span>{deliverable.fileName} 作答草稿</span>
      <textarea value={answer} readOnly={!userEmail} onFocus={() => { if (!userEmail) requireSignIn(); }} onChange={(event) => changeAnswer(event.target.value)} placeholder={deliverable.placeholder} />
    </label>
    {referenceNarrative && <details className="lab-word-reference">
      <summary><span><b>核对参考答案</b><small>在当前草稿下方直接对比</small></span><strong>显示答案</strong></summary>
      <div>
        <header><div><p className="eyebrow">参考内容</p><h3>{deliverable.fileName}</h3></div><SourceBadge source={task.answerSource} basis={task.answerBasis} /></header>
        <p>{referenceNarrative}</p>
      </div>
    </details>}
    <footer>{userEmail ? "草稿自动保存在当前浏览器。截图、HTML、模型与数据文件仍在实验区按原题保存。" : "登录后可在此起草 Word 答题卷。"}</footer>
  </section>;
}
