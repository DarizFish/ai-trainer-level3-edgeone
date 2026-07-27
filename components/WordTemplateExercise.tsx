"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { createPracticalWordExercise } from "@/lib/practical-word-exercise";
import { PracticalTaskHeader } from "./PracticalTaskHeader";
import { PracticalBrief } from "./PracticalBrief";
import { PracticalMaterialsList } from "./PracticalMaterialsList";

type WordDraft = {
  version: 1;
  answers: Record<string, string>;
  checks: Record<string, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function restoreDraft(serialized: string, fieldIds: Set<string>) {
  try {
    const candidate = JSON.parse(serialized) as Partial<WordDraft>;
    if (candidate.version !== 1 || !isRecord(candidate.answers) || !isRecord(candidate.checks)) return null;
    const answers: Record<string, string> = {};
    const checks: Record<string, boolean> = {};
    for (const fieldId of fieldIds) {
      if (typeof candidate.answers[fieldId] === "string") answers[fieldId] = (candidate.answers[fieldId] as string).slice(0, 5_000);
      if (typeof candidate.checks[fieldId] === "boolean") checks[fieldId] = candidate.checks[fieldId] as boolean;
    }
    return { answers, checks };
  } catch {
    return null;
  }
}

export function WordTemplateExercise({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const exercise = useMemo(() => createPracticalWordExercise(task), [task]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const revisionRef = useRef(0);
  const storageKey = useMemo(() => exercise && userEmail
    ? `ai-trainer-word-draft-v1:${encodeURIComponent(userEmail)}:${task.code}:${exercise.materialSha256.slice(0, 16)}`
    : null, [exercise, task.code, userEmail]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const fieldIds = new Set(exercise?.fields.map((field) => field.id) ?? []);
      const draft = storageKey ? restoreDraft(localStorage.getItem(storageKey) ?? "", fieldIds) : null;
      if (userEmail) {
        void fetch(`/api/drafts/${task.code}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((payload: { draft?: { cellsJson?: string; revision?: number } | null } | null) => {
            if (cancelled || !payload?.draft?.cellsJson) return;
            revisionRef.current = payload.draft.revision ?? 0;
            const cloud = restoreDraft(payload.draft.cellsJson, fieldIds);
            if (!cloud) return;
            const hasCloud = Object.values(cloud.answers).some((value) => value.trim());
            const hasLocal = Object.values(draft?.answers ?? {}).some((value) => value.trim());
            if (hasCloud || !hasLocal) { setAnswers(cloud.answers); setChecks(cloud.checks); }
          })
          .catch(() => undefined);
      }
      setAnswers(draft?.answers ?? {});
      setChecks(draft?.checks ?? {});
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [exercise, storageKey, task.code, userEmail]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    const draft: WordDraft = { version: 1, answers, checks };
    localStorage.setItem(storageKey, JSON.stringify(draft));
    if (!userEmail) return;
    // 与答题卷同一套：本机是离线缓存，账号里的那份才是跨设备的依据。
    const timer = window.setTimeout(() => {
      void fetch(`/api/drafts/${task.code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answerSheet: draft, revision: revisionRef.current }),
      }).then(async (response) => {
        if (response.status === 409) {
          const conflict = await response.json() as { cloud?: WordDraft; revision?: number };
          revisionRef.current = conflict.revision ?? revisionRef.current;
          if (conflict.cloud?.answers) {
            setAnswers(conflict.cloud.answers);
            setChecks(conflict.cloud.checks ?? {});
            setSyncNote("已载入其它设备上更新的填写。");
          }
          return;
        }
        if (!response.ok) { setSyncNote("云端同步失败，内容仍保存在本机。"); return; }
        const saved = await response.json() as { revision?: number };
        revisionRef.current = saved.revision ?? revisionRef.current + 1;
        setSyncNote("");
      }).catch(() => setSyncNote("云端同步失败，内容仍保存在本机。"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [answers, checks, restored, storageKey, task.code, userEmail]);

  if (!exercise) return null;
  const fieldCount = exercise.fields.length;
  const fieldByBlock = new Map(exercise.fields.map((field) => [field.blockIndex, field]));
  const answeredCount = exercise.fields.filter((field) => answers[field.id]?.trim()).length;
  const checkedCount = exercise.fields.filter((field) => Object.prototype.hasOwnProperty.call(checks, field.id)).length;

  function requireSignIn() {
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(`/practical/${task.code}`)}`);
  }

  function changeAnswer(fieldId: string, value: string) {
    if (!userEmail) return requireSignIn();
    setAnswers((current) => ({ ...current, [fieldId]: value.slice(0, 5_000) }));
    setChecks((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function checkAnswer(fieldId: string, achieved: boolean) {
    if (!userEmail) return requireSignIn();
    setChecks((current) => ({ ...current, [fieldId]: achieved }));
  }

  function toggleReview() {
    setRevealed((value) => !value);
  }

  return <section id={`work-${task.code}`} className="business-answer-sheet word-answer-sheet word-template-exercise word-template-answer-sheet">
    <aside id={`task-${task.code}`} className="business-sheet-sidebar word-workbench-context">
      <PracticalTaskHeader task={task} variant="rail" />
      <p className="practical-rail-intro">直接补全官方 Word 模板中的 {fieldCount} 处横线，每处 1 分。</p>
      <PracticalBrief task={task} open={false} />
      <PracticalMaterialsList task={task} />
      <section className="word-context-progress" aria-label="作答状态">
        <header><p className="eyebrow">作答状态</p><strong>{answeredCount}<small> / {fieldCount}</small></strong><span>处已填写</span></header>
        <nav aria-label="填写位置">{exercise.fields.map((field, index) => {
          const answered = Boolean(answers[field.id]?.trim());
          return <a className={answered ? "complete" : "pending"} href={`#word-field-${task.code}-${field.id}`} key={field.id}><span>{answered ? "✓" : index + 1}</span><b>{field.label}</b></a>;
        })}</nav>
        <div className="word-side-review">{revealed ? <small>参考填写已显示在对应横线下方。</small> : <small>{userEmail ? (syncNote || "草稿已同步到账号") : "登录后可填写"}</small>}<button type="button" className={`button ${revealed ? "button-quiet" : "button-primary"}`} onClick={toggleReview}>{revealed ? "返回填写" : "完成并核对"}</button></div>
      </section>
    </aside>
    <div className="business-sheet-paper word-document-canvas" role="document" aria-label={`${exercise.materialName} 答题卷`}>
      <section className="business-sheet-section word-template-sheet-section">
        <header><span>WORD 答题卷</span><h2>{task.code}</h2></header>
      <header className="word-exercise-heading">
        <p className="word-document-label">{exercise.materialName}</p>
        <p className="word-exercise-progress" aria-label={`已填写 ${answeredCount} 处，共 ${exercise.fields.length} 处`}>已填写 <strong>{answeredCount}</strong> / {exercise.fields.length}</p>
      </header>
      <div className="document-preview-page word-exercise-document" role="document" aria-label={`${exercise.materialName} 在线填写`}>
        {exercise.blocks.map((block, blockIndex) => {
          const field = fieldByBlock.get(blockIndex);
          if (!field) return <p className={`document-preview-${block.kind}`} key={`${blockIndex}-${block.text}`}>{block.text}</p>;
          const checked = Object.prototype.hasOwnProperty.call(checks, field.id);
          const fieldNumber = exercise.fields.indexOf(field) + 1;
          return <article id={`word-field-${task.code}-${field.id}`} className={`word-fill-slot ${checked ? checks[field.id] ? "achieved" : "revise" : ""}`} data-word-answer={field.id} key={field.id}>
            <p className="word-fill-line">
              <span>{field.before}</span>
              <label className="word-inline-field"><span className="sr-only">{field.label}</span><input aria-label={`${field.label}：填写内容`} type="text" value={answers[field.id] ?? ""} readOnly={!userEmail} maxLength={5_000} onFocus={() => { if (!userEmail) requireSignIn(); }} onChange={(event) => changeAnswer(field.id, event.target.value)} placeholder="填写" /></label>
              {field.after && <span>{field.after}</span>}
            </p>
            {revealed && <div className="word-fill-reference">
              <p><b>参考填写</b><span>{field.referenceAnswer}</span></p>
              <div role="group" aria-label={`核对空白 ${fieldNumber}`}>
                <button type="button" className={checked && !checks[field.id] ? "active revise" : ""} aria-pressed={checked && !checks[field.id]} onClick={() => checkAnswer(field.id, false)}>未达到 · 0 分</button>
                <button type="button" className={checked && checks[field.id] ? "active achieved" : ""} aria-pressed={checked && checks[field.id]} onClick={() => checkAnswer(field.id, true)}>达到 · 1 分</button>
              </div>
            </div>}
          </article>;
        })}
      </div>
      </section>
      <footer id={`review-${task.code}`} className="word-exercise-actions">
        <div className="word-review-status">{revealed ? <span>逐处对照参考填写后，确认每空得分。</span> : <span>{userEmail ? (syncNote || "草稿与核分已同步到账号，换设备可继续") : "登录后可填写并核分"}</span>}</div>
        <button type="button" className={`button ${revealed ? "button-quiet" : "button-primary"}`} onClick={toggleReview}>{revealed ? "返回填写" : "完成填写，核对答案"}</button>
      </footer>
      {revealed && checkedCount === fieldCount && <p className="correct word-exercise-saved">✓ 本题已完成全部核分，当前 {exercise.fields.filter((field) => checks[field.id]).length} / {task.maxScore} 分；修改填写会撤销对应旧分数。</p>}
    </div>
  </section>;
}
