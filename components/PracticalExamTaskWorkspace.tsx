"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { PracticalTask } from "@/lib/content";
import { createPracticalResponseExercise } from "@/lib/practical-response-exercise";
import { createPracticalWordExercise } from "@/lib/practical-word-exercise";
import type { PracticalRubricScores } from "@/lib/scoring";
import { PracticalMaterials } from "./PracticalMaterials";
import { PracticalOutcomeCheck } from "./PracticalOutcomeCheck";
import { PracticalSourceNote, SourceBadge } from "./SourceBadge";

export function PracticalExamTaskWorkspace({ task, phase, answers, checks, scores, onAnswerChange, onCheckChange, onScoreChange }: {
  task: PracticalTask;
  phase: "running" | "review";
  answers: Record<string, string>;
  checks: Record<string, boolean>;
  scores: PracticalRubricScores;
  onAnswerChange: (fieldId: string, value: string) => void;
  onCheckChange: (fieldId: string, achieved: boolean) => void;
  onScoreChange: (itemId: string, score: number) => void;
}) {
  const word = useMemo(() => createPracticalWordExercise(task), [task]);
  const response = useMemo(() => createPracticalResponseExercise(task), [task]);

  function setWordCheck(fieldId: string, achieved: boolean) {
    const next = { ...checks, [fieldId]: achieved };
    onCheckChange(fieldId, achieved);
    if (word) onScoreChange(task.rubric[0].id, word.fields.filter((field) => next[field.id]).length);
  }

  return <div className="exam-deliverable-workspace">
    <details className="exam-task-brief" open={phase === "running"}>
      <summary><span><b>任务清单</b><small>场景、目标与提交要求</small></span><span aria-hidden="true">⌄</span></summary>
      <div className="task-description">{task.description}</div>
    </details>

    {phase === "running" && <PracticalMaterials materials={task.materials} compact showDocumentPreview={false} />}

    {word && <section className={`exam-word-workspace ${phase}`}>
      <header><div><p className="eyebrow">WORD DELIVERABLE</p><h2>{phase === "running" ? "在官方模板中完成 5 处填写" : "逐空对照本次成果"}</h2></div><span>{word.materialName}</span></header>
      <div className="document-preview-page exam-word-document" role="document" aria-label={`${word.materialName} ${phase === "running" ? "考试作答" : "成果复盘"}`}>
        {word.blocks.map((block, blockIndex) => {
          const field = word.fields.find((candidate) => candidate.blockIndex === blockIndex);
          if (!field) return <p className={`document-preview-${block.kind}`} key={`${blockIndex}-${block.text}`}>{block.text}</p>;
          const fieldNumber = word.fields.indexOf(field) + 1;
          const checked = Object.prototype.hasOwnProperty.call(checks, field.id);
          return <article className={`exam-word-field ${checked ? checks[field.id] ? "achieved" : "revise" : ""}`} key={field.id}>
            <header><span>空白 {fieldNumber}</span><b>{field.label}</b></header>
            <p><span>{field.before}</span><mark>{answers[field.id]?.trim() || "待填写"}</mark><span>{field.after}</span></p>
            {phase === "running" ? <label><span>你的填写</span><textarea aria-label={`${field.label}：考试作答`} value={answers[field.id] ?? ""} onChange={(event) => onAnswerChange(field.id, event.target.value)} placeholder="填写此处内容…" /></label> : <div className="exam-word-review">
              <p><b>参考填写</b><span>{field.referenceAnswer}</span></p>
              <div role="group" aria-label={`核对空白 ${fieldNumber}`}><button type="button" className={checked && !checks[field.id] ? "active revise" : ""} aria-pressed={checked && !checks[field.id]} onClick={() => setWordCheck(field.id, false)}>还需修改 · 0 分</button><button type="button" className={checked && checks[field.id] ? "active achieved" : ""} aria-pressed={checked && checks[field.id]} onClick={() => setWordCheck(field.id, true)}>达到要点 · 1 分</button></div>
            </div>}
          </article>;
        })}
      </div>
      {phase === "review" && <footer className="exam-reference-source"><SourceBadge source={task.answerSource} basis={task.answerBasis} /><PracticalSourceNote basis={task.answerBasis} /><b>已核对 {Object.keys(checks).length} / {word.fields.length} 处 · 当前 {word.fields.filter((field) => checks[field.id]).length} / {task.maxScore} 分</b></footer>}
    </section>}

    {response && <section className={`exam-response-workspace ${phase}`}>
      <header><div><p className="eyebrow">TWO DELIVERABLES</p><h2>{phase === "running" ? "分别完成两份交付物" : "按交付物复盘成果"}</h2></div><span>{response.sections.filter((section) => answers[section.id]?.trim()).length} / 2 份已作答</span></header>
      <div className="exam-response-list">{response.sections.map((section) => <article key={section.id}>
        <header><span>{section.number}</span><div><small>第 {section.number} 份交付物</small><h3>{section.title}</h3></div><b>{section.outputLabel}</b></header>
        <div className="exam-response-prompt"><b>本份任务</b><p>{section.prompt}</p></div>
        {phase === "running" ? <label><span>你的作答</span><textarea aria-label={`${section.outputLabel}：考试作答`} value={answers[section.id] ?? ""} onChange={(event) => onAnswerChange(section.id, event.target.value)} placeholder={section.number === 1 ? "写出分析结论、数据依据与必要说明…" : "写出优化方向、实施步骤与预期效果…"} /></label> : <>
          <div className="exam-response-comparison"><section><b>本次作答</b><p>{answers[section.id]?.trim() || "（未作答）"}</p></section><section><b>参考成果</b><p>{section.referenceAnswer}</p></section></div>
          <PracticalOutcomeCheck items={section.rubric} scores={scores} onChange={onScoreChange} title={`核对第 ${section.number} 份交付物`} />
        </>}
      </article>)}</div>
      {phase === "review" && <footer className="exam-reference-source"><SourceBadge source={task.answerSource} basis={task.answerBasis} /><PracticalSourceNote basis={task.answerBasis} /></footer>}
    </section>}

    {task.hasNotebook && phase === "review" && <section className="exam-notebook-review">
      <header><div><p className="eyebrow">NOTEBOOK OUTCOME</p><h2>复盘代码与运行成果</h2></div><Link className="button button-small" href={`/practical/${task.code}/lab`}>打开本题 Notebook ↗</Link></header>
      <div className="exam-notebook-comparison"><section><b>本次运行说明</b><p>{answers.notes?.trim() || "未填写运行结果或生成文件说明；Notebook 草稿仍保存在当前浏览器与账号中。"}</p></section><section><div className="answer-line"><b>参考成果</b><SourceBadge source={task.answerSource} basis={task.answerBasis} /></div><PracticalSourceNote basis={task.answerBasis} /><p>{task.referenceAnswer}</p>{task.notebook?.solutionCells.map((cell, index) => <details key={cell.id} open={index === 0}><summary>参考代码单元 {index + 1}</summary><pre><code>{cell.source}</code></pre></details>)}</section></div>
      <PracticalOutcomeCheck items={task.rubric} scores={scores} onChange={onScoreChange} />
    </section>}
  </div>;
}
