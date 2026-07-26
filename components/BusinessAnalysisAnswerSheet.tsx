"use client";

import { useEffect, useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { createPracticalResponseExercise } from "@/lib/practical-response-exercise";
import type { PracticalRubricScores } from "@/lib/scoring";
import { PracticalOutcomeCheck } from "./PracticalOutcomeCheck";
import { PracticalTaskHeader } from "./PracticalTaskHeader";
import { PracticalBrief } from "./PracticalBrief";
import { PracticalMaterialsList } from "./PracticalMaterialsList";

type AnswerSheetDraft = {
  version: 1 | 3;
  answers: Record<string, string>;
  scores: PracticalRubricScores;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function restoreDraft(serialized: string, sectionIds: Set<string>, scoreLimits: Map<string, number>) {
  try {
    const candidate = JSON.parse(serialized) as Partial<AnswerSheetDraft>;
    if (![1, 3].includes(candidate.version ?? 0) || !isRecord(candidate.answers) || !isRecord(candidate.scores)) return null;
    const answers: Record<string, string> = {};
    const scores: PracticalRubricScores = {};
    for (const sectionId of sectionIds) if (typeof candidate.answers[sectionId] === "string") answers[sectionId] = (candidate.answers[sectionId] as string).slice(0, 10_000);
    for (const [itemId, maxScore] of scoreLimits) {
      const value = candidate.scores[itemId];
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maxScore) scores[itemId] = value;
    }
    return { answers, scores };
  } catch {
    return null;
  }
}

function promptForAnswerSheet(prompt: string) {
  return prompt.replace(/\n将上述答案写在[^\n]+/g, "").trim();
}

export function BusinessAnalysisAnswerSheet({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const exercise = useMemo(() => createPracticalResponseExercise(task), [task]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<PracticalRubricScores>({});
  const [reviewing, setReviewing] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageKey = useMemo(() => exercise && userEmail
    ? `ai-trainer-business-answer-sheet-v1:${encodeURIComponent(userEmail)}:${task.code}:${exercise.storageVersion}`
    : null, [exercise, task.code, userEmail]);
  const legacyStorageKey = useMemo(() => exercise && userEmail && task.group === "3.1"
    ? `ai-trainer-practical-response-v3:${encodeURIComponent(userEmail)}:${task.code}:${exercise.storageVersion}`
    : null, [exercise, task.code, task.group, userEmail]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const sectionIds = new Set(exercise?.sections.map((section) => section.id) ?? []);
      const scoreLimits = new Map(exercise?.sections.flatMap((section) => section.rubric).map((item) => [item.id, item.points]) ?? []);
      const serialized = storageKey
        ? localStorage.getItem(storageKey) ?? (legacyStorageKey ? localStorage.getItem(legacyStorageKey) : null) ?? ""
        : "";
      const draft = storageKey ? restoreDraft(serialized, sectionIds, scoreLimits) : null;
      setAnswers(draft?.answers ?? {});
      setScores(draft?.scores ?? {});
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [exercise, legacyStorageKey, storageKey]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, answers, scores } satisfies AnswerSheetDraft));
  }, [answers, restored, scores, storageKey]);

  if (!exercise) return null;
  const answeredCount = exercise.sections.filter((section) => answers[section.id]?.trim()).length;
  const rubricItems = exercise.sections.flatMap((section) => section.rubric);
  const assessedCount = rubricItems.filter((item) => Object.prototype.hasOwnProperty.call(scores, item.id)).length;

  function requireSignIn() {
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(`/practical/${task.code}`)}`);
  }

  function changeAnswer(sectionId: string, value: string) {
    if (!userEmail) return requireSignIn();
    setAnswers((current) => ({ ...current, [sectionId]: value.slice(0, 10_000) }));
    const section = exercise?.sections.find((item) => item.id === sectionId);
    setScores((current) => {
      const next = { ...current };
      for (const item of section?.rubric ?? []) delete next[item.id];
      return next;
    });
  }

  function changeScore(itemId: string, value: number) {
    if (!userEmail) return requireSignIn();
    setScores((current) => ({ ...current, [itemId]: value }));
  }

  return <section id={`work-${task.code}`} className="business-answer-sheet word-answer-sheet">
    <aside className="business-sheet-sidebar">
      <PracticalTaskHeader task={task} variant="rail" />
      <PracticalBrief task={task} open={false} />
      <PracticalMaterialsList task={task} />
      <nav aria-label="大题导航">{exercise.sections.map((section) => {
        const answered = Boolean(answers[section.id]?.trim());
        return <a href={`#business-answer-${task.code}-${section.number}`} className={answered ? "complete" : "pending"} key={section.id}><span>{section.number}</span><b>{section.number === 1 ? "第一问" : "第二问"}</b><small>{answered ? "已填写" : "待作答"}</small></a>;
      })}</nav>
      <footer>{reviewing ? <small>当前为学习复盘，不是官方考场评分。</small> : <small>{userEmail ? `已填写 ${answeredCount} / 2 问，草稿自动保存。` : "登录后可填写并保存答题卷。"}</small>}<button type="button" className={`button ${reviewing ? "button-quiet" : "button-primary"}`} onClick={() => setReviewing((value) => !value)}>{reviewing ? "返回作答" : "完成作答，进入复盘"}</button></footer>
    </aside>
    <div className="business-sheet-paper" role="document" aria-label={`${task.code} 答题卷`}>
      {exercise.sections.map((section) => <section id={`business-answer-${task.code}-${section.number}`} className="business-sheet-section" key={section.id}>
        <header><span>第 {section.number} 问</span><h2>{task.code}-{section.number}</h2><b className="business-sheet-output">{section.outputLabel}</b></header>
        <p className="business-sheet-prompt">{promptForAnswerSheet(section.prompt)}</p>
        <label><span className="sr-only">{task.code}-{section.number} 作答</span><textarea value={answers[section.id] ?? ""} readOnly={!userEmail} onFocus={() => { if (!userEmail) requireSignIn(); }} onChange={(event) => changeAnswer(section.id, event.target.value)} placeholder="请在此处作答…" /></label>
        {reviewing && <section className="business-sheet-review">
          <header><span>学习复盘</span><small>完成作答后展示；非官方考场信息。</small></header>
          <p>{section.referenceAnswer}</p>
          <PracticalOutcomeCheck items={section.rubric} scores={scores} onChange={changeScore} title={`第 ${section.number} 问复盘检查`} eyebrow="学习复盘检查" description="逐项检查本次作答，仅用于练习自评，不属于考场提示。" />
        </section>}
      </section>)}
      {reviewing && assessedCount === rubricItems.length && <footer className="business-sheet-review-note"><p className="correct">✓ 已完成本题全部复盘检查；修改作答会撤销对应的旧自评分。</p></footer>}
    </div>
  </section>;
}
