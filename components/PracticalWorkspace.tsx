"use client";

import { useEffect, useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { examBlueprint } from "@/lib/exam-blueprint";
import { createPracticalWordExercise } from "@/lib/practical-word-exercise";
import { PracticalMaterials } from "./PracticalMaterials";
import { BusinessAnalysisAnswerSheet } from "./BusinessAnalysisAnswerSheet";
import { WordTemplateExercise } from "./WordTemplateExercise";

export default function PracticalWorkspace({ task, userEmail }: { task: PracticalTask; userEmail: string | null }) {
  const wordExercise = useMemo(() => createPracticalWordExercise(task), [task]);
  const reportAnswerSheet = task.group === "1.2" || task.group === "3.1";
  const [notes, setNotes] = useState("");
  const [notesRestored, setNotesRestored] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const examWeight = Math.round(task.maxScore / examBlueprint.practical.maxScore * 100);
  const reviewAnchor = wordExercise ? `#review-${task.code}` : `#work-${task.code}`;
  const notesStorageKey = useMemo(() => !wordExercise && !reportAnswerSheet && userEmail
    ? `ai-trainer-practical-notes-v1:${encodeURIComponent(userEmail)}:${task.code}`
    : null, [reportAnswerSheet, task.code, userEmail, wordExercise]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setNotes(notesStorageKey ? (localStorage.getItem(notesStorageKey) ?? "").slice(0, 20_000) : "");
      setNotesRestored(true);
    });
    return () => { cancelled = true; };
  }, [notesStorageKey]);

  useEffect(() => {
    if (notesRestored && notesStorageKey) localStorage.setItem(notesStorageKey, notes.slice(0, 20_000));
  }, [notes, notesRestored, notesStorageKey]);

  function requireSignIn() {
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(`/practical/${task.code}`)}`);
  }

  function changeNotes(value: string) {
    if (!userEmail) return requireSignIn();
    setNotes(value.slice(0, 20_000));
  }

  if (reportAnswerSheet) return <BusinessAnalysisAnswerSheet key={task.code} task={task} userEmail={userEmail} />;

  return <div className={`practical-study-flow ${wordExercise ? "word-answer-first" : ""}`}>
    <>
    {!wordExercise && <><header className="practical-flow-header">
      <div className="question-meta"><div className="question-meta-left"><span className="question-number">题号 {task.code}</span><span className="chip">{task.category}</span><span className="chip">{task.unit}</span><span className="chip">建议 {task.durationMinutes} 分钟</span></div></div>
      <div className="practical-flow-score"><span>本题满分</span><strong>{task.maxScore}<small> 分</small></strong><p>占实操总分 {examWeight}%</p></div>
    </header>
    <nav className="practical-flow-nav" aria-label="本题学习流程"><a href={`#task-${task.code}`}><span>1</span><b>题目</b><small>明确任务</small></a><a href={`#materials-${task.code}`}><span>2</span><b>素材</b><small>准备文件</small></a><a href={`#work-${task.code}`}><span>3</span><b>作答</b><small>完成交付物</small></a><a href={reviewAnchor}><span>4</span><b>答案与评分</b><small>完成后核对</small></a></nav></>}
    <article className="detail-main practical-task-content">
      {wordExercise ? <WordTemplateExercise key={task.code} task={task} userEmail={userEmail} /> : <><details id={`task-${task.code}`} className="task-instructions" open>
        <summary><span><b>官方题目要求</b><small>完整保留指导手册工作任务</small></span><span aria-hidden="true">⌄</span></summary>
        <div className="task-description">{task.description}</div>
      </details>
      <div id={`materials-${task.code}`}><PracticalMaterials materials={task.materials} showDocumentPreview /></div>
      <section id={`work-${task.code}`} className="answer-workspace"><div className="answer-workspace-heading"><div><p className="eyebrow">WORK NOTES</p><h2>作答记录</h2></div><span>{userEmail ? "草稿自动保存在当前浏览器" : "登录后可填写作答草稿"}</span></div><p className="small-copy">记录操作步骤、结果文件、截图说明和复盘要点；单题练习先聚焦完成任务，不再显示抽象评分面板。</p><textarea className="field" value={notes} readOnly={!userEmail} onChange={(event) => changeNotes(event.target.value)} onFocus={() => { if (!userEmail) requireSignIn(); }} placeholder="记录操作步骤、结果文件、截图说明或复盘要点…" /></section>
      {revealed && <div className="answer-panel" id={`review-${task.code}`}><div className="answer-line"><b>参考答案</b></div><p style={{ whiteSpace: "pre-wrap" }}>{task.referenceAnswer}</p></div>}
      <div className="question-actions"><button className="button button-quiet" onClick={() => setRevealed((value) => !value)}>{revealed ? "收起参考答案" : "完成后核对参考答案"}</button></div>
      </>}
    </article></>
  </div>;
}
