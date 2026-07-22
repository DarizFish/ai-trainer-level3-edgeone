"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TheoryQuestion } from "@/lib/content";
import { examBlueprint } from "@/lib/exam-blueprint";
import {
  createActiveTheoryExamSnapshot,
  createFinishedTheoryExamSnapshot,
  restoreTheoryExamSnapshot,
  THEORY_MOCK_STORAGE_KEY,
  type TheoryExamMode,
  type TheoryExamResult,
} from "@/lib/theory-exam-storage";
import { getTheoryReviewPage, type TheoryReviewFilter } from "@/lib/theory-review";
import { SourceBadge } from "./SourceBadge";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type Mode = TheoryExamMode;
type ExamResult = TheoryExamResult;

function pickRandom(all: TheoryQuestion[]) {
  const shuffle = (items: TheoryQuestion[]) => items.map((question) => ({ question, n: Math.random() })).sort((a, b) => a.n - b.n).map((item) => item.question);
  return [
    ...shuffle(all.filter((q) => q.type === "judge")).slice(0, examBlueprint.theory.types.judge.count),
    ...shuffle(all.filter((q) => q.type === "single")).slice(0, examBlueprint.theory.types.single.count),
    ...shuffle(all.filter((q) => q.type === "multi")).slice(0, examBlueprint.theory.types.multi.count),
  ];
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function TheoryMock({ allQuestions, officialQuestions, signedIn, contentVersion }: { allQuestions: TheoryQuestion[]; officialQuestions: TheoryQuestion[]; signedIn: boolean; contentVersion: string }) {
  const [mode, setMode] = useState<Mode>("official");
  const [questions, setQuestions] = useState<TheoryQuestion[]>(officialQuestions);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [deadlineAt, setDeadlineAt] = useState(0);
  const [seconds, setSeconds] = useState(examBlueprint.theory.durationMinutes * 60);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [reviewFilter, setReviewFilter] = useState<TheoryReviewFilter>("all");
  const [reviewPage, setReviewPage] = useState(0);
  const [showNavigator, setShowNavigator] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<"all" | "answered" | "unanswered">("all");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const questionsRef = useRef(questions);
  const answersRef = useRef(answers);
  const currentRef = useRef(current);
  const deadlineAtRef = useRef(deadlineAt);
  const modeRef = useRef<Mode>(mode);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);
  const autoSubmitAttemptedRef = useRef(false);

  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { deadlineAtRef.current = deadlineAt; }, [deadlineAt]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const submitExam = useCallback(async () => {
    if (finishedRef.current || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const activeQuestions = questionsRef.current;
      const activeAnswers = answersRef.current;
      const response = await fetch("/api/theory/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: modeRef.current, questionIds: activeQuestions.map((q) => q.id), answers: activeAnswers }),
      });
      if (!response.ok) throw new Error("交卷失败，答案已保存在当前浏览器，请稍后重试。");
      const nextResult = await response.json() as ExamResult;
      const completed = createFinishedTheoryExamSnapshot({
        contentVersion,
        mode: modeRef.current,
        questions: activeQuestions,
        answers: activeAnswers,
        current: currentRef.current,
        deadlineAt: deadlineAtRef.current,
        result: nextResult,
      });
      localStorage.setItem(THEORY_MOCK_STORAGE_KEY, JSON.stringify(completed));
      finishedRef.current = true;
      setResult(nextResult);
      setFinished(true);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "交卷失败，请稍后重试。");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [contentVersion]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const serialized = localStorage.getItem(THEORY_MOCK_STORAGE_KEY);
    if (!serialized) return;
    const restored = restoreTheoryExamSnapshot(serialized, allQuestions, contentVersion);
    if (!restored) {
      localStorage.removeItem(THEORY_MOCK_STORAGE_KEY);
      return;
    }
    const saved = restored.snapshot;
    const isFinished = saved.phase === "finished";
    modeRef.current = saved.mode;
    questionsRef.current = restored.questions;
    answersRef.current = restored.answers;
    currentRef.current = saved.current;
    deadlineAtRef.current = saved.deadlineAt;
    finishedRef.current = isFinished;
    autoSubmitAttemptedRef.current = isFinished;
    queueMicrotask(() => {
      if (cancelled) return;
      setMode(saved.mode);
      setQuestions(restored.questions);
      setAnswers(restored.answers);
      setCurrent(saved.current);
      setDeadlineAt(saved.deadlineAt);
      setSeconds(isFinished ? 0 : Math.max(0, Math.ceil((saved.deadlineAt - Date.now()) / 1000)));
      setStarted(true);
      setFinished(isFinished);
      setResult(restored.result);
      setReviewFilter("all");
      setReviewPage(0);
    });
    return () => { cancelled = true; };
  }, [allQuestions, contentVersion, signedIn]);

  useEffect(() => {
    if (!started || finished || !deadlineAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0 && !autoSubmitAttemptedRef.current) {
        autoSubmitAttemptedRef.current = true;
        void submitExam();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, finished, started, submitExam]);

  useEffect(() => {
    if (!started || finished || !deadlineAt) return;
    const saved = createActiveTheoryExamSnapshot({ contentVersion, mode, questions, answers, current, deadlineAt });
    localStorage.setItem(THEORY_MOCK_STORAGE_KEY, JSON.stringify(saved));
  }, [answers, contentVersion, current, deadlineAt, finished, mode, questions, started]);

  const answered = useMemo(() => Object.values(answers).filter((answer) => answer.length).length, [answers]);
  const question = questions[current];
  const visibleNavigatorIndexes = useMemo(() => questions.map((_, index) => index).filter((index) => navigatorFilter === "all" || (navigatorFilter === "answered" ? Boolean(answers[questions[index].id]?.length) : !answers[questions[index].id]?.length)), [answers, navigatorFilter, questions]);

  function begin(force = false) {
    if (!signedIn) { window.location.assign("/account?mode=login&return_to=%2Ftheory%2Fmock"); return; }
    if (force && !window.confirm("重新开始会清除当前浏览器中保存的本次理论考试进度，确定继续吗？")) return;
    const nextQuestions = mode === "official" ? officialQuestions : pickRandom(allQuestions);
    const nextDeadline = Date.now() + examBlueprint.theory.durationMinutes * 60 * 1000;
    questionsRef.current = nextQuestions;
    answersRef.current = {};
    currentRef.current = 0;
    deadlineAtRef.current = nextDeadline;
    modeRef.current = mode;
    finishedRef.current = false;
    autoSubmitAttemptedRef.current = false;
    localStorage.removeItem(THEORY_MOCK_STORAGE_KEY);
    setQuestions(nextQuestions);
    setStarted(true);
    setFinished(false);
    setAnswers({});
    setCurrent(0);
    setDeadlineAt(nextDeadline);
    setSeconds(examBlueprint.theory.durationMinutes * 60);
    setResult(null);
    setReviewFilter("all");
    setReviewPage(0);
    setShowNavigator(false);
    setSubmitError("");
  }

  function choose(value: string) {
    if (!question || seconds === 0) return;
    setAnswers((state) => {
      const next = question.type === "multi"
        ? { ...state, [question.id]: (state[question.id] ?? []).includes(value) ? state[question.id].filter((item) => item !== value) : [...(state[question.id] ?? []), value] }
        : { ...state, [question.id]: [value] };
      answersRef.current = next;
      return next;
    });
  }

  function jump(index: number) { setCurrent(index); setShowNavigator(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function jumpToNextUnanswered() {
    const nextIndex = questions.findIndex((item, index) => index > current && !answers[item.id]?.length);
    const wrappedIndex = nextIndex >= 0 ? nextIndex : questions.findIndex((item, index) => index <= current && !answers[item.id]?.length);
    if (wrappedIndex >= 0) jump(wrappedIndex);
  }

  if (!started) return <div className="container mock-entry"><div className="detail-layout"><section className="detail-main"><p className="eyebrow">考试说明</p><h2>理论知识模拟考试</h2><div className="notice">倒计时与答案保存在当前浏览器，刷新后可继续。交卷后由服务端按题库重新计分。</div><div className="question-list" style={{ marginTop: 18 }}><label className={`option ${mode === "official" ? "selected" : ""}`}><input type="radio" checked={mode === "official"} onChange={() => setMode("official")} /><span><b>官方模拟卷</b><br />190 道题均来自手册官方模拟题，答案为官方答案。</span></label><label className={`option ${mode === "random" ? "selected" : ""}`}><input type="radio" checked={mode === "random"} onChange={() => setMode("random")} /><span><b>随机模拟卷</b><br />从 900 道题中按官方题型配比随机抽取，无重复。</span></label></div></section><aside className="detail-side"><section><h2>考试规则</h2><p>考试时间 <b>{examBlueprint.theory.durationMinutes} 分钟</b></p>{Object.values(examBlueprint.theory.types).map((type) => <p key={type.label}>{type.label} {type.count} × {type.points} 分</p>)}<p>多选必须完全匹配，不给部分分。</p><div className="score-box"><span>合格线</span><strong>{examBlueprint.passingScore}</strong></div><button className="button button-primary" style={{ width: "100%", marginTop: 18 }} onClick={() => begin()}>{signedIn ? "开始考试" : "登录后开始"}</button></section></aside></div></div>;

  if (finished && result) {
    const reviewIds = [...result.wrongQuestionIds, ...result.unansweredQuestionIds];
    const byId = new Map(questions.map((item) => [item.id, item]));
    const wrongIds = new Set(result.wrongQuestionIds);
    const review = getTheoryReviewPage(result.wrongQuestionIds, result.unansweredQuestionIds, reviewFilter, reviewPage);
    const changeReviewFilter = (filter: TheoryReviewFilter) => { setReviewFilter(filter); setReviewPage(0); };
    return <div className="container workspace mock-result-page">
      <div className="mock-score"><p>本次理论模拟成绩</p><strong>{result.score}</strong><span>/ {result.maxScore} 分</span><h2>{result.passed ? "理论科目合格" : "理论科目暂未合格"}</h2><p>理论与实操分别达到 {examBlueprint.passingScore} 分才合格。</p></div>
      <div className="mock-breakdown">{result.byType.map((item) => <div key={item.type}><span>{examBlueprint.theory.types[item.type].label}</span><strong>{item.score} / {item.maxScore}</strong><small>答对 {item.correct} / {item.total}</small></div>)}<div><span>未作答</span><strong>{result.unansweredQuestionIds.length}</strong><small>错题 {result.wrongQuestionIds.length}</small></div></div>
      <div className="hero-actions"><button className="button button-primary" onClick={() => begin(true)}>重新开始</button>{result.wrongQuestionIds[0] && <Link className="button button-quiet" href={`/theory?question=${encodeURIComponent(result.wrongQuestionIds[0])}`}>去错题模式订正</Link>}</div>
      <p className="mock-result-retention">本次交卷结果保存在当前浏览器，刷新后仍可继续复盘；开始新考试时会清除。</p>
      <section className="mock-review">
        <div className="panel-heading"><div><p className="eyebrow">交卷后复盘</p><h2>错题与未答题</h2></div><span>{reviewIds.length} 题</span></div>
        {reviewIds.length === 0 ? <div className="empty-state compact">全部作答正确，表现很稳。</div> : <>
          <div className="mock-review-toolbar">
            <div className="mock-review-filters" role="group" aria-label="筛选复盘题目">
              <button aria-pressed={reviewFilter === "all"} onClick={() => changeReviewFilter("all")}>全部 {reviewIds.length}</button>
              <button aria-pressed={reviewFilter === "wrong"} onClick={() => changeReviewFilter("wrong")}>错题 {result.wrongQuestionIds.length}</button>
              <button aria-pressed={reviewFilter === "unanswered"} onClick={() => changeReviewFilter("unanswered")}>未答 {result.unansweredQuestionIds.length}</button>
            </div>
            <span>{review.ids.length ? `显示 ${review.start}–${review.end} / ${review.ids.length} 题` : "当前筛选无题目"}</span>
          </div>
          {review.visibleIds.length === 0 ? <div className="empty-state compact">当前筛选下没有题目。<button type="button" onClick={() => changeReviewFilter("all")}>查看全部待复盘题</button></div> : <div className="mock-review-list">{review.visibleIds.map((id) => { const item = byId.get(id); if (!item) return null; const status = wrongIds.has(id) ? "错题" : "未作答"; return <details key={id}><summary><span className="question-number">#{item.index}</span><span>{item.stem}</span><em className={wrongIds.has(id) ? "wrong" : "unanswered"}>{status}</em></summary><div><p>你的答案：<b>{answers[id]?.join("、") || "未作答"}</b></p><p>参考答案：<b>{item.answer.join("、")}</b>　<SourceBadge source={item.answerSource} basis={item.answerBasis} /></p><p>{item.explanation}</p><Link className="text-link" href={`/theory?question=${encodeURIComponent(id)}`}>打开题库详解 →</Link></div></details>; })}</div>}
          {review.pageCount > 1 && <nav className="mock-review-pager" aria-label="复盘分页"><button type="button" disabled={review.page === 0} onClick={() => setReviewPage((page) => Math.max(0, page - 1))}>上一页</button><span>第 {review.page + 1} / {review.pageCount} 页</span><button type="button" disabled={review.page === review.pageCount - 1} onClick={() => setReviewPage((page) => Math.min(review.pageCount - 1, page + 1))}>下一页</button></nav>}
        </>}
      </section>
    </div>;
  }

  if (!question) return <div className="container workspace"><div className="notice">试卷恢复失败，请重新开始。</div></div>;
  const displayOptions = question.type === "judge" ? ["√", "×"] : question.options.map((_, index) => LETTERS[index]);
  const selected = answers[question.id] ?? [];
  const navGroups = (["judge", "single", "multi"] as const).map((type) => ({ key: type, label: examBlueprint.theory.types[type].label, indexes: visibleNavigatorIndexes.filter((index) => questions[index].type === type) }));

  return <div>
    <div className="mock-dock"><div className="container mock-dock-row"><div><b>{mode === "official" ? "官方模拟卷" : "随机模拟卷"}</b>　<span>第 {current + 1} / {questions.length} 题　·　已答 {answered}</span></div><div className="mock-dock-actions"><button className="button button-small mock-answer-sheet-trigger" aria-controls="theory-mock-answer-sheet" aria-expanded={showNavigator} onClick={() => setShowNavigator((value) => !value)}>答题卡</button><span className={`timer ${seconds <= 300 ? "timer-warning" : ""}`}>{formatTime(seconds)}</span><button className="button button-small" onClick={() => begin(true)}>重新开始</button><button className="button button-small button-danger" disabled={submitting} onClick={() => void submitExam()}>{submitting ? "正在交卷…" : "交卷"}</button></div></div><div className="mock-progress-track"><span style={{ width: `${(answered / questions.length) * 100}%` }} /></div></div>
    <div className="container workspace theory-mock-layout">
      <main className="theory-mock-question-column">
        {submitError && <div className="account-error" role="alert">{submitError} <button type="button" onClick={() => void submitExam()}>重试交卷</button></div>}
        <article className="question-card"><div className="question-meta"><div className="question-meta-left"><span className="question-number">第 {current + 1} 题</span><span className="chip">{question.typeLabel}</span><span className="chip">{question.points} 分</span></div></div><h2 className="question-title">{question.stem}</h2><div className="options">{displayOptions.map((value, index) => <label key={value} className={`option ${selected.includes(value) ? "selected" : ""}`}><input type={question.type === "multi" ? "checkbox" : "radio"} checked={selected.includes(value)} onChange={() => choose(value)} /><span><b>{question.type === "judge" ? value : `${value}.`}</b> {question.type === "judge" ? (value === "√" ? "正确" : "错误") : question.options[index]}</span></label>)}</div><div className="question-actions mock-question-actions"><button className="button button-quiet" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>上一题</button><button className="button button-quiet" disabled={answered === questions.length} onClick={jumpToNextUnanswered}>下一未答</button><button className="button button-primary" onClick={() => current === questions.length - 1 ? void submitExam() : setCurrent((value) => value + 1)}>{current === questions.length - 1 ? "完成并交卷" : "下一题"}</button></div></article>
      </main>
      {showNavigator && <button type="button" className="theory-mock-nav-backdrop" aria-label="关闭答题卡" onClick={() => setShowNavigator(false)} />}
      <aside id="theory-mock-answer-sheet" className={`theory-mock-answer-sheet ${showNavigator ? "open" : ""}`} aria-label="理论模拟答题卡">
        <header>
          <div><p className="eyebrow">答题进度</p><h2>题目导航</h2></div>
          <button type="button" className="answer-sheet-close" aria-label="关闭答题卡" onClick={() => setShowNavigator(false)}>×</button>
        </header>
        <div className="answer-sheet-summary"><div><strong>{answered}</strong><span>已答</span></div><div><strong>{questions.length - answered}</strong><span>未答</span></div><div><strong>{questions.length}</strong><span>总题数</span></div></div>
        <div className="navigator-filters" aria-label="按作答状态筛选"><button className={navigatorFilter === "all" ? "active" : ""} onClick={() => setNavigatorFilter("all")}>全部</button><button className={navigatorFilter === "unanswered" ? "active" : ""} onClick={() => setNavigatorFilter("unanswered")}>未答 {questions.length - answered}</button><button className={navigatorFilter === "answered" ? "active" : ""} onClick={() => setNavigatorFilter("answered")}>已答 {answered}</button></div>
        <div className="navigator-groups">{navGroups.map((group) => <section key={group.key}><h3>{group.label} <span>{group.indexes.length}</span></h3>{group.indexes.length > 0 ? <div>{group.indexes.map((index) => <button key={questions[index].id} className={`${answers[questions[index].id]?.length ? "answered" : ""} ${index === current ? "current" : ""}`} aria-label={`第 ${index + 1} 题${answers[questions[index].id]?.length ? "，已答" : "，未答"}`} aria-current={index === current ? "step" : undefined} onClick={() => jump(index)}>{index + 1}</button>)}</div> : <p>当前筛选下无题目</p>}</section>)}</div>
        <footer><span><i className="legend-current" />当前题</span><span><i className="legend-answered" />已答</span><span><i />未答</span><button type="button" onClick={jumpToNextUnanswered} disabled={answered === questions.length}>下一未答 →</button></footer>
      </aside>
    </div>
  </div>;
}
