"use client";

import { useEffect, useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { createPracticalResponseExercise } from "@/lib/practical-response-exercise";
import type { PracticalRubricScores } from "@/lib/scoring";
import { PracticalMaterials } from "./PracticalMaterials";
import { PracticalOutcomeCheck } from "./PracticalOutcomeCheck";

type ResponseDraft = {
  version: 3;
  answers: Record<string, string>;
  scores: PracticalRubricScores;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function restoreDraft(serialized: string, sectionIds: Set<string>, scoreLimits: Map<string, number>) {
  try {
    const candidate = JSON.parse(serialized) as Partial<ResponseDraft>;
    if (candidate.version !== 3 || !isRecord(candidate.answers) || !isRecord(candidate.scores)) return null;
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

export function PracticalResponseExercise({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const exercise = useMemo(() => createPracticalResponseExercise(task), [task]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<PracticalRubricScores>({});
  const [revealed, setRevealed] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageKey = useMemo(() => exercise && userEmail
    ? `ai-trainer-practical-response-v3:${encodeURIComponent(userEmail)}:${task.code}:${exercise.storageVersion}`
    : null, [exercise, task.code, userEmail]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const sectionIds = new Set(exercise?.sections.map((section) => section.id) ?? []);
      const scoreLimits = new Map(exercise?.sections.flatMap((section) => section.rubric).map((item) => [item.id, item.points]) ?? []);
      const draft = storageKey ? restoreDraft(localStorage.getItem(storageKey) ?? "", sectionIds, scoreLimits) : null;
      setAnswers(draft?.answers ?? {});
      setScores(draft?.scores ?? {});
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [exercise, storageKey]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    const draft: ResponseDraft = { version: 3, answers, scores };
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [answers, restored, scores, storageKey]);

  if (!exercise) return null;
  const answeredCount = exercise.sections.filter((section) => answers[section.id]?.trim()).length;
  const rubricItems = exercise.sections.flatMap((section) => section.rubric);
  const assessedCount = rubricItems.filter((item) => Object.prototype.hasOwnProperty.call(scores, item.id)).length;
  const currentScore = rubricItems.reduce((sum, item) => sum + (scores[item.id] ?? 0), 0);

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

  return <section className="practical-response-layout" id={`work-${task.code}`}>
    <aside className="response-study-rail" aria-label="本题答题导航">
      <p className="eyebrow">本题答题卷</p><h2>{task.code}</h2><p>官方题面与 Excel 素材在左侧；右侧直接开始两份 Word 报告。</p>
      <nav>{exercise.sections.map((section) => <a href={`#response-${task.code}-${section.id}`} key={section.id}><span>{section.number}</span><b>{section.title}</b><small>{section.outputLabel}</small></a>)}</nav>
      <details className="response-task-requirements">
        <summary>查看完整官方题面</summary>
        <div className="task-description">{task.description}</div>
      </details>
      <PracticalMaterials materials={task.materials} compact showDocumentPreview={false} />
    </aside>
    <div className="response-study-main">
      <header className="practical-response-heading">
        <div><p className="eyebrow">两份 Word 报告</p><h2>直接开始作答</h2><p>先完成两份独立交付物；完整题面与 Excel 素材保留在左侧，复盘时才显示答案和评分项。</p></div>
        <div className="practical-response-progress" aria-label={`已作答 ${answeredCount} 份，共 2 份`}><strong>{answeredCount}</strong><span>/ 2 份已作答</span></div>
      </header>
      <p className="response-save-note">{userEmail ? "草稿自动保存在当前浏览器。" : "登录后可在此填写两份 Word 报告。"}</p>
      <div className="practical-response-list">
        {exercise.sections.map((section) => {
          const sectionItems = section.rubric;
          const sectionAssessed = sectionItems.filter((item) => Object.prototype.hasOwnProperty.call(scores, item.id)).length;
          return <article id={`response-${task.code}-${section.id}`} className={`practical-response-section ${revealed ? "reviewing" : ""} ${revealed && sectionAssessed === sectionItems.length ? sectionItems.every((item) => scores[item.id] === item.points) ? "achieved" : "revise" : ""}`} data-response-section={section.id} key={section.id}>
            <div className="practical-response-authoring">
              <header><span>{section.number}</span><div><p>第 {section.number} 份交付物</p><h3>{section.title}</h3></div><b>{section.outputLabel}</b></header>
              <details className="response-deliverable-brief"><summary>查看本份题目要求</summary><p>{section.prompt}</p></details>
              <label><span>你的作答</span><textarea value={answers[section.id] ?? ""} readOnly={!userEmail} onFocus={() => { if (!userEmail) requireSignIn(); }} onChange={(event) => changeAnswer(section.id, event.target.value)} placeholder={section.number === 1 ? "写出分析结论、数据依据与必要说明…" : "写出优化方向、实施步骤与预期效果…"} /></label>
            </div>
            {revealed && <div className="practical-response-reference">
              <header><span>复盘区</span><small>修改本份作答会撤销对应的自评结果</small></header>
              <p>{section.referenceAnswer}</p>
              <PracticalOutcomeCheck items={sectionItems} scores={scores} onChange={changeScore} title={`核对第 ${section.number} 份交付物`} />
            </div>}
          </article>;
        })}
      </div>
      <footer className="practical-response-actions">
        <div>{revealed ? <p className={assessedCount === rubricItems.length ? "correct" : ""}>{assessedCount === rubricItems.length ? `已完成全部核对：${currentScore} / ${task.maxScore} 分` : `还有 ${rubricItems.length - assessedCount} 项待核对`}</p> : <p>完成两份作答后，再进入答案与评分复盘。</p>}</div>
        <button type="button" className={`button ${revealed ? "button-quiet" : "button-primary"}`} onClick={() => setRevealed((value) => !value)}>{revealed ? "返回作答" : "完成作答，进入复盘"}</button>
      </footer>
    </div>
  </section>;
}
