"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { examBlueprint, practicalModuleForGroup } from "@/lib/exam-blueprint";
import { formatPracticalExamAnswer, practicalExamAnswerProgress } from "@/lib/practical-exam-answer";
import {
  createPracticalExamSnapshot,
  PRACTICAL_MOCK_STORAGE_KEY,
  restorePracticalExamSnapshot,
  type PracticalExamAnswers,
  type PracticalExamChecks,
  type PracticalExamMode,
  type PracticalExamPhase,
  type PracticalExamResult,
} from "@/lib/practical-exam-storage";
import { createPracticalWordExercise } from "@/lib/practical-word-exercise";
import type { PracticalRubricScores } from "@/lib/scoring";
import JupyterLiteLab from "./JupyterLiteLab";
import { PracticalExamTaskWorkspace } from "./PracticalExamTaskWorkspace";

function randomMock(all: PracticalTask[]) {
  return examBlueprint.practical.modules.map((examSection) => {
    const pool = all.filter((task) => (examSection.groups as readonly string[]).includes(task.group));
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function taskReviewRemaining(task: PracticalTask, checks: Record<string, boolean>, scores: PracticalRubricScores) {
  const word = createPracticalWordExercise(task);
  if (word) return word.fields.filter((field) => !Object.prototype.hasOwnProperty.call(checks, field.id)).length;
  return task.rubric.filter((item) => !Object.prototype.hasOwnProperty.call(scores, item.id)).length;
}

export default function PracticalMock({ allTasks, officialTasks, contentVersion, signedIn }: { allTasks: PracticalTask[]; officialTasks: PracticalTask[]; contentVersion: string; signedIn: boolean }) {
  const [mode, setMode] = useState<PracticalExamMode>("official");
  const [tasks, setTasks] = useState(officialTasks);
  const [phase, setPhase] = useState<"idle" | PracticalExamPhase>("idle");
  const [current, setCurrent] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState(0);
  const [seconds, setSeconds] = useState(examBlueprint.practical.durationMinutes * 60);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<PracticalExamAnswers>({});
  const [checks, setChecks] = useState<PracticalExamChecks>({});
  const [rubric, setRubric] = useState<Record<string, PracticalRubricScores>>({});
  const [results, setResults] = useState<Record<string, PracticalExamResult>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoFinishRef = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const serialized = localStorage.getItem(PRACTICAL_MOCK_STORAGE_KEY);
    if (!serialized) return;
    const restored = restorePracticalExamSnapshot(serialized, allTasks, officialTasks, contentVersion);
    if (!restored) { localStorage.removeItem(PRACTICAL_MOCK_STORAGE_KEY); return; }
    queueMicrotask(() => {
      if (cancelled) return;
      const saved = restored.snapshot;
      setMode(saved.mode);
      setTasks(restored.tasks);
      setCurrent(saved.current);
      setDeadlineAt(saved.deadlineAt);
      setSeconds(saved.phase === "running" ? Math.max(0, Math.ceil((saved.deadlineAt - Date.now()) / 1000)) : 0);
      setCompleted(restored.completed);
      setAnswers(restored.answers);
      setChecks(restored.checks);
      setRubric(restored.rubric);
      setResults(restored.results);
      setPhase(saved.phase);
    });
    return () => { cancelled = true; };
  }, [allTasks, contentVersion, officialTasks, signedIn]);

  useEffect(() => {
    if (phase !== "running" || !deadlineAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0 && !autoFinishRef.current) {
        autoFinishRef.current = true;
        setPhase("review");
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, phase]);

  useEffect(() => {
    if (phase === "idle") return;
    const saved = createPracticalExamSnapshot({ contentVersion, phase, mode, tasks, current, deadlineAt, completed, answers, checks, rubric, results });
    localStorage.setItem(PRACTICAL_MOCK_STORAGE_KEY, JSON.stringify(saved));
  }, [answers, checks, completed, contentVersion, current, deadlineAt, mode, phase, results, rubric, tasks]);

  const activeTask = tasks[current];
  const completedCount = useMemo(() => tasks.filter((task) => completed[task.code]).length, [completed, tasks]);
  const totalScore = useMemo(() => tasks.reduce((sum, task) => sum + (results[task.code]?.score ?? 0), 0), [results, tasks]);
  const reviewRemaining = useMemo(() => tasks.reduce((sum, task) => sum + taskReviewRemaining(task, checks[task.code] ?? {}, rubric[task.code] ?? {}), 0), [checks, rubric, tasks]);
  const reviewedTaskCount = useMemo(() => tasks.filter((task) => taskReviewRemaining(task, checks[task.code] ?? {}, rubric[task.code] ?? {}) === 0).length, [checks, rubric, tasks]);

  function start(force = false) {
    if (!signedIn) { window.location.assign("/account?mode=login&return_to=%2Fpractical%2Fmock"); return; }
    if (force && !window.confirm("重新开始会清除当前浏览器中保存的本次实操考试进度，确定继续吗？")) return;
    const next = mode === "official" ? officialTasks : randomMock(allTasks);
    const nextDeadline = Date.now() + examBlueprint.practical.durationMinutes * 60 * 1000;
    localStorage.removeItem(PRACTICAL_MOCK_STORAGE_KEY);
    autoFinishRef.current = false;
    setTasks(next);
    setPhase("running");
    setCurrent(0);
    setDeadlineAt(nextDeadline);
    setSeconds(examBlueprint.practical.durationMinutes * 60);
    setCompleted({});
    setAnswers({});
    setChecks({});
    setRubric({});
    setResults({});
    setSubmitError("");
  }

  function finishExam() {
    if (!window.confirm("结束后将停止作答并进入成果复盘，确定结束吗？")) return;
    setSeconds(0);
    setPhase("review");
  }

  function changeAnswer(taskCode: string, fieldId: string, value: string) {
    setAnswers((state) => ({ ...state, [taskCode]: { ...(state[taskCode] ?? {}), [fieldId]: value.slice(0, 10_000) } }));
  }

  function setCheck(taskCode: string, fieldId: string, achieved: boolean) {
    setChecks((state) => ({ ...state, [taskCode]: { ...(state[taskCode] ?? {}), [fieldId]: achieved } }));
  }

  function setRubricScore(taskCode: string, itemId: string, score: number) {
    setRubric((state) => ({ ...state, [taskCode]: { ...(state[taskCode] ?? {}), [itemId]: score } }));
  }

  async function submitReview() {
    if (Object.keys(results).length === tasks.length) { setPhase("result"); return; }
    if (submitting || reviewRemaining > 0) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/practical/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attempts: tasks.map((task) => ({
            taskCode: task.code,
            rubric: rubric[task.code] ?? {},
            notes: formatPracticalExamAnswer(task, answers[task.code] ?? {}),
          })),
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? "六题成果核对保存失败，请稍后重试。");
      }
      const payload = await response.json() as { results: Record<string, PracticalExamResult> };
      if (!payload.results || Object.keys(payload.results).length !== tasks.length) throw new Error("成绩结果不完整，请重新提交。");
      setResults(payload.results);
      setPhase("result");
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "实操成果核对提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function taskNav() {
    return <section className="practical-exam-task-strip" aria-label="六题考场导航"><header><div><p className="eyebrow">六题考场</p><h2>题目导航</h2></div><p>{phase === "running" ? `已标记完成 ${completedCount} / ${tasks.length}` : `已完成评分 ${reviewedTaskCount} / ${tasks.length}`}</p></header><nav>{tasks.map((task, index) => {
      const examModule = practicalModuleForGroup(task.group);
      const reviewDone = taskReviewRemaining(task, checks[task.code] ?? {}, rubric[task.code] ?? {}) === 0;
      const done = phase === "running" ? Boolean(completed[task.code]) : reviewDone;
      return <button type="button" className={index === current ? "active" : ""} key={task.code} onClick={() => setCurrent(index)}><span>{index + 1}</span><span><b>{examModule?.label ?? task.category}</b><small>{task.code} · {task.maxScore} 分</small></span><i aria-label={done ? "已完成" : "未完成"}>{done ? "✓" : "○"}</i></button>;
    })}</nav></section>;
  }

  if (phase === "idle") return <div className="container mock-entry"><section className="practical-mock-start"><header><p className="eyebrow">实操模拟</p><h2>{examBlueprint.practical.totalTasks} 题 · {examBlueprint.practical.durationMinutes} 分钟 · {examBlueprint.practical.maxScore} 分</h2><p>业务分析二选一；数据处理、算法测试、系统优化、人机交互各一题；培训或指导二选一。</p></header><div className="practical-mock-rules"><div><b>作答方式</b><p>每题按“题目与素材 → 交付物作答”顺序完成，六题通过顶部题号条切换。</p></div><div><b>简化计时</b><p>开始后计时；切题和刷新不会重置。同一浏览器可恢复本次进度。</p></div><div><b>考后评分</b><p>交卷后才展示参考答案与官方评分项，逐项核对后生成模拟成绩。</p></div><div><b>合格线</b><strong>{examBlueprint.passingScore}<small> / 100 分</small></strong></div></div><div className="practical-mock-options"><label className={`option ${mode === "official" ? "selected" : ""}`}><input type="radio" checked={mode === "official"} onChange={() => setMode("official")} /><span><b>官方实操模拟卷</b><br />固定采用手册中的官方模拟题，组成完整六题考场。</span></label><label className={`option ${mode === "random" ? "selected" : ""}`}><input type="radio" checked={mode === "random"} onChange={() => setMode("random")} /><span><b>随机实操模拟卷</b><br />按六个官方模块从 40 道题中随机抽取，模块与权重不变。</span></label></div><footer><button className="button button-primary" onClick={() => start()}>{signedIn ? "开始考试" : "登录后开始"}</button></footer></section></div>;

  if (phase === "result") return <div className="container workspace mock-result-page"><div className="mock-score"><p>本次实操模拟核对得分</p><strong>{totalScore}</strong><span>/ {examBlueprint.practical.maxScore} 分</span><h2>{totalScore >= examBlueprint.passingScore ? "实操科目模拟合格" : "实操科目暂未合格"}</h2><p>其中人工核对项用于备考复盘，不代表官方认定成绩。</p></div><div className="practical-result-grid">{tasks.map((task) => { const examModule = practicalModuleForGroup(task.group); return <button type="button" key={task.code} onClick={() => { setCurrent(tasks.indexOf(task)); setPhase("review"); }}><span>{examModule?.label ?? task.category}</span><strong>{results[task.code]?.score ?? 0} / {task.maxScore}</strong><small>{task.code} · 查看成果复盘</small></button>; })}</div><div className="separate-pass-note"><b>两科分别判定：</b>理论与实操都需分别达到 {examBlueprint.passingScore} 分，不计算综合平均分；未合格科目可单独补考。</div><div className="hero-actions"><button className="button button-primary" onClick={() => start(true)}>重新组卷</button></div></div>;

  if (!activeTask) return <div className="container workspace"><div className="notice">实操试卷恢复失败，请重新开始。</div></div>;

  const examModule = practicalModuleForGroup(activeTask.group);
  const activeAnswers = answers[activeTask.code] ?? {};
  const activeProgress = practicalExamAnswerProgress(activeTask, activeAnswers);

  return <div className="practical-exam-page">
    <div className="mock-dock"><div className="container mock-dock-row"><div><b>{phase === "running" ? (mode === "official" ? "官方实操模拟卷" : "随机实操模拟卷") : "考后成果复盘"}</b>　<span>第 {current + 1} / {tasks.length} 题 · {examModule?.label}</span></div><div className="mock-dock-actions">{phase === "running" && <><span className={`timer ${seconds <= 600 ? "timer-warning" : ""}`}>{formatTime(seconds)}</span><button className="button button-small" onClick={() => start(true)}>重新开始</button><button className="button button-small button-danger" onClick={finishExam}>结束考试</button></>}{phase === "review" && <><span className="mock-review-status">{reviewRemaining ? `还有 ${reviewRemaining} 项成果待核对` : "六题成果已核对完成"}</span><button className="button button-small button-danger" disabled={submitting || reviewRemaining > 0} onClick={() => void submitReview()}>{Object.keys(results).length === tasks.length ? "返回成绩" : submitting ? "正在生成成绩…" : reviewRemaining ? `还需核对 ${reviewRemaining} 项` : "生成并保存成绩"}</button></>}</div></div><div className="mock-progress-track"><span style={{ width: `${((phase === "running" ? completedCount : reviewedTaskCount) / tasks.length) * 100}%` }} /></div></div>
    <section className="container practical-exam-layout">
      {taskNav()}
      <div className="practical-exam-workspace">
        {submitError && <div className="account-error" role="alert">{submitError}</div>}
        <header className="practical-task-head"><div><span className="question-number">{activeTask.code}</span><span className="chip">{examModule?.label ?? activeTask.category}</span><span className="chip">{activeTask.maxScore} 分</span><span className="chip">建议 {activeTask.durationMinutes} 分钟</span></div><h1>{activeTask.title}</h1>{phase === "running" && <p>当前已完成 {activeProgress.completed} / {activeProgress.total} {activeProgress.label}</p>}</header>
        {phase === "running" ? <>
          {activeTask.hasNotebook ? <><PracticalExamTaskWorkspace task={activeTask} phase="running" answers={activeAnswers} checks={{}} scores={{}} onAnswerChange={(fieldId, value) => changeAnswer(activeTask.code, fieldId, value)} onCheckChange={() => undefined} onScoreChange={() => undefined} /><JupyterLiteLab key={activeTask.code} task={activeTask} signedIn={signedIn} examMode /><section className="practical-exam-notes"><label>运行结果与生成文件说明<textarea className="field" value={activeAnswers.notes ?? ""} onChange={(event) => changeAnswer(activeTask.code, "notes", event.target.value)} placeholder="记录关键输出、指标、图表或生成文件…" /></label></section></> : <PracticalExamTaskWorkspace task={activeTask} phase="running" answers={activeAnswers} checks={{}} scores={{}} onAnswerChange={(fieldId, value) => changeAnswer(activeTask.code, fieldId, value)} onCheckChange={() => undefined} onScoreChange={() => undefined} />}
          <div className="practical-complete-bar"><label><input type="checkbox" checked={Boolean(completed[activeTask.code])} onChange={() => setCompleted((state) => ({ ...state, [activeTask.code]: !state[activeTask.code] }))} /> 标记本题已完成</label><div><button className="button button-quiet" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>上一题</button><button className="button button-primary" disabled={current === tasks.length - 1} onClick={() => setCurrent((value) => value + 1)}>下一题</button></div></div>
        </> : <div className="practical-review-workspace">
          <PracticalExamTaskWorkspace task={activeTask} phase="review" answers={activeAnswers} checks={checks[activeTask.code] ?? {}} scores={rubric[activeTask.code] ?? {}} onAnswerChange={() => undefined} onCheckChange={(fieldId, achieved) => setCheck(activeTask.code, fieldId, achieved)} onScoreChange={(itemId, value) => setRubricScore(activeTask.code, itemId, value)} />
          <div className="practical-complete-bar"><span>{taskReviewRemaining(activeTask, checks[activeTask.code] ?? {}, rubric[activeTask.code] ?? {}) ? "完成当前成果核对后再切换下一模块" : "✓ 本题成果已核对"}</span><div><button className="button button-quiet" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>上一题</button><button className="button button-primary" disabled={current === tasks.length - 1} onClick={() => setCurrent((value) => value + 1)}>下一题</button></div></div>
        </div>}
      </div>
    </section>
  </div>;
}
