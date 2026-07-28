"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TheoryQuestion, TheoryType } from "@/lib/content";
import { isCorrect } from "@/lib/scoring";
import { useAccountSession } from "./AccountSession";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const RESUME_KEY = "ai-trainer-theory-session-v6";
const QUESTION_MAP_PAGE_SIZE = 50;
// 答对后自动跳下一题。原先 450ms，「回答正确」和解析一闪而过，等于答对的题没有反馈，
// 与首页「即时判分…把注意力留给知识点本身」的说法相悖。放宽到能读完一句解析，并且
// 用户一有动作就取消跳转，想停下看就停得下来。
const CORRECT_AUTO_ADVANCE_MS = 2600;

type Screen = "practice" | "result";
type ResumeState = {
  contentVersion: string;
  ids: string[];
  index: number;
  label: string;
  answers?: Record<string, string[]>;
  feedback?: Record<string, boolean>;
  updatedAt: number;
};

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export default function TheoryPractice({ questions, contentVersion }: { questions: TheoryQuestion[]; contentVersion: string }) {
  const { status: accountStatus } = useAccountSession();
  const signedIn = accountStatus === "authenticated";
  const defaultIds = useMemo(() => questions.filter((question) => question.type === "judge").map((question) => question.id), [questions]);
  const [screen, setScreen] = useState<Screen>("practice");
  const [sessionIds, setSessionIds] = useState<string[]>(defaultIds);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionLabel, setSessionLabel] = useState("判断题 · 完整 300 题");
  const [persistSession, setPersistSession] = useState(true);
  const [urlQuestionId, setUrlQuestionId] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [answeredIds, setAnsweredIds] = useState<Record<string, boolean>>({});
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [resettingType, setResettingType] = useState<TheoryType | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePage, setPalettePage] = useState(0);
  const questionCardRef = useRef<HTMLElement>(null);
  const questionGridRef = useRef<HTMLDivElement>(null);
  const pendingAnswersRef = useRef(new Map<string, { answer: string[]; attempts: number }>());
  const progressTimerRef = useRef<number | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("question");
    queueMicrotask(() => {
      if (requestedId && questionById.has(requestedId)) {
        setUrlQuestionId(requestedId);
        setSessionIds([requestedId]);
        setCurrentIndex(0);
        setSessionLabel("单题练习");
        setPersistSession(false);
      }
      setUrlReady(true);
    });
  }, [questionById]);

  useEffect(() => {
    if (!urlReady || urlQuestionId || !signedIn) return;
    try {
      const stored = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as ResumeState | null;
      if (stored && stored.contentVersion !== contentVersion) {
        localStorage.removeItem(RESUME_KEY);
        return;
      }
      const ids = stored?.ids.filter((id) => questionById.has(id)) ?? [];
      if (!stored || ids.length < 2) return;
      const restoredAnswers: Record<string, string[]> = {};
      const restoredFeedback: Record<string, boolean> = {};
      for (const id of ids) {
        const question = questionById.get(id);
        const candidate = stored.answers?.[id];
        const result = stored.feedback?.[id];
        if (!question) continue;
        const validOptions = question.type === "judge" ? ["√", "×"] : question.options.map((_, index) => LETTERS[index]);
        const answer = Array.isArray(candidate) ? candidate.filter((value): value is string => typeof value === "string" && validOptions.includes(value)) : [];
        if (answer.length && (question.type === "multi" || typeof result === "boolean")) restoredAnswers[id] = answer;
        if (answer.length && typeof result === "boolean") restoredFeedback[id] = result;
      }
      queueMicrotask(() => {
        setSessionIds(ids);
        const restoredIndex = Math.min(Math.max(stored.index, 0), ids.length - 1);
        setCurrentIndex(restoredIndex);
        setPalettePage(Math.floor(restoredIndex / QUESTION_MAP_PAGE_SIZE));
        setSessionLabel(stored.label);
        setAnswers((current) => ({ ...current, ...restoredAnswers }));
        setFeedback((current) => ({ ...current, ...restoredFeedback }));
        setRevealed((current) => ({
          ...current,
          ...Object.fromEntries(Object.keys(restoredFeedback).map((id) => [id, true])),
        }));
        setPersistSession(true);
      });
    } catch {
      localStorage.removeItem(RESUME_KEY);
    }
  }, [contentVersion, questionById, signedIn, urlQuestionId, urlReady]);

  useEffect(() => {
    if (!signedIn) return;
    void fetch("/api/theory/state")
      .then(async (response) => response.ok
        ? await response.json() as {
          favoriteIds: string[];
          answeredIds: string[];
          wrongIds: string[];
          progress: { questionId: string; answer: string[]; correct: boolean }[];
        }
        : { favoriteIds: [], answeredIds: [], wrongIds: [], progress: [] })
      .then((state) => {
        setFavorites(Object.fromEntries(state.favoriteIds.map((id) => [id, true])));
        setAnsweredIds((current) => ({
          ...Object.fromEntries(state.answeredIds.map((id) => [id, true])),
          ...current,
        }));
        setWrongIds(state.wrongIds);
        const storedAnswers = Object.fromEntries(state.progress.map((item) => [item.questionId, item.answer]));
        const storedFeedback = Object.fromEntries(state.progress.map((item) => [item.questionId, item.correct]));
        const storedRevealed = Object.fromEntries(state.progress.map((item) => [item.questionId, true]));
        setAnswers((current) => ({ ...storedAnswers, ...current }));
        setFeedback((current) => ({ ...storedFeedback, ...current }));
        setRevealed((current) => ({ ...storedRevealed, ...current }));
      })
      .catch(() => undefined);
  }, [signedIn]);

  useEffect(() => {
    if (!urlReady || screen !== "practice" || !persistSession || sessionIds.length < 2) return;
    const sessionAnswers = Object.fromEntries(sessionIds.flatMap((id) => answers[id]?.length ? [[id, answers[id]]] : []));
    const sessionFeedback = Object.fromEntries(sessionIds.flatMap((id) => typeof feedback[id] === "boolean" ? [[id, feedback[id]]] : []));
    const state: ResumeState = { contentVersion, ids: sessionIds, index: currentIndex, label: sessionLabel, answers: sessionAnswers, feedback: sessionFeedback, updatedAt: Date.now() };
    localStorage.setItem(RESUME_KEY, JSON.stringify(state));
  }, [answers, contentVersion, currentIndex, feedback, persistSession, screen, sessionIds, sessionLabel, urlReady]);

  const sessionQuestions = useMemo(() => sessionIds.flatMap((id) => {
    const question = questionById.get(id);
    return question ? [question] : [];
  }), [questionById, sessionIds]);
  const currentQuestion = sessionQuestions[currentIndex];
  const { answeredCount, correctCount, sessionWrongIds } = useMemo(() => {
    let answered = 0;
    let correct = 0;
    const wrongIds: string[] = [];
    for (const question of sessionQuestions) {
      const result = feedback[question.id];
      if (result !== undefined) answered += 1;
      if (result === true) correct += 1;
      if (result === false) wrongIds.push(question.id);
    }
    return { answeredCount: answered, correctCount: correct, sessionWrongIds: wrongIds };
  }, [feedback, sessionQuestions]);
  const correctRate = answeredCount ? Math.round(correctCount / answeredCount * 100) : 0;
  const favoriteCount = useMemo(() => Object.values(favorites).filter(Boolean).length, [favorites]);
  const typeProgress = useMemo(() => ([
    { type: "judge" as const, label: "判断题" },
    { type: "single" as const, label: "单选题" },
    { type: "multi" as const, label: "多选题" },
  ]).map((item) => {
    const typedQuestions = questions.filter((question) => question.type === item.type);
    const answered = typedQuestions.filter((question) => answeredIds[question.id]).length;
    return { ...item, answered, total: typedQuestions.length };
  }), [answeredIds, questions]);

  useEffect(() => {
    if (screen !== "practice") return;
    questionGridRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentIndex, palettePage, screen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (screen !== "practice" || !currentQuestion) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;
      const options = currentQuestion.type === "judge" ? ["√", "×"] : currentQuestion.options.map((_, index) => LETTERS[index]);
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < options.length && !revealed[currentQuestion.id]) {
        event.preventDefault();
        choose(currentQuestion, options[optionIndex]);
        return;
      }
      if (event.key === "Enter") {
        if (revealed[currentQuestion.id] && currentIndex < sessionQuestions.length - 1) {
          event.preventDefault();
          goToQuestion(currentIndex + 1);
        } else if (currentQuestion.type === "multi" && (answers[currentQuestion.id] ?? []).length) {
          event.preventDefault();
          void submit(currentQuestion);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const flushProgress = useCallback((preferBeacon = false) => {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const attempts = [...pendingAnswersRef.current].map(([questionId, value]) => ({
      questionId,
      answer: value.answer,
      attempts: value.attempts,
    }));
    if (!attempts.length) return;
    const body = JSON.stringify({ attempts });

    if (preferBeacon && navigator.sendBeacon) {
      // beacon 由浏览器保证投递，可以立刻出队。
      const queued = navigator.sendBeacon("/api/theory/answer", new Blob([body], { type: "application/json" }));
      if (queued) { for (const item of attempts) pendingAnswersRef.current.delete(item.questionId); return; }
    }

    // 关键：请求成功之前不出队。原先在发出前就 clear()，一旦用户在请求在途时切页，
    // fetch 会被 ERR_ABORTED，而卸载时的兜底 flush 看到的是空队列，什么也发不出去；
    // 随后 .catch 把条目写回一个已卸载组件的 ref，等于静默丢答。
    void fetch("/api/theory/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error("progress sync failed");
      for (const item of attempts) {
        const current = pendingAnswersRef.current.get(item.questionId);
        // 期间又答了同一题就保留新值，不要把新答案一起删掉。
        if (current && current.attempts <= item.attempts) pendingAnswersRef.current.delete(item.questionId);
      }
    }).catch(() => {
      setActionError("答案已在本机判分，学习记录暂未同步；继续练习时会再次保存。");
    });
  }, []);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushProgress(true);
    };
    const flushOnPageHide = () => flushProgress(true);
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushOnPageHide);
      flushProgress(true);
    };
  }, [flushProgress]);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current !== null) window.clearTimeout(autoAdvanceTimerRef.current);
  }, []);

  function queueProgress(questionId: string, answer: string[]) {
    const pending = pendingAnswersRef.current.get(questionId);
    pendingAnswersRef.current.set(questionId, {
      answer,
      attempts: (pending?.attempts ?? 0) + 1,
    });
    if (progressTimerRef.current === null) {
      progressTimerRef.current = window.setTimeout(() => flushProgress(), 900);
    }
  }

  function requireSignIn(): boolean {
    if (accountStatus === "loading") {
      setActionError("正在确认账号状态，请稍候。");
      return false;
    }
    if (signedIn) return true;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/account?mode=login&return_to=${encodeURIComponent(returnTo)}`);
    return false;
  }

  function focusQuestion() {
    requestAnimationFrame(() => questionCardRef.current?.focus({ preventScroll: true }));
  }

  function closeDrawers() {
    setNavOpen(false);
    setPaletteOpen(false);
  }

  function beginPractice(ids: string[], startIndex = 0, label = "练习", resetResponses = true) {
    if (!requireSignIn()) return;
    const validIds = ids.filter((id) => questionById.has(id));
    if (!validIds.length) {
      setActionError("当前范围没有可练习的题目，请调整条件后重试。");
      return;
    }
    setActionError("");
    const boundedIndex = Math.min(Math.max(startIndex, 0), validIds.length - 1);
    setSessionIds(validIds);
    setCurrentIndex(boundedIndex);
    setPalettePage(Math.floor(boundedIndex / QUESTION_MAP_PAGE_SIZE));
    setSessionLabel(label);
    setPersistSession(validIds.length > 1);
    if (resetResponses) {
      const resetIds = new Set(validIds);
      setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !resetIds.has(id))));
      setRevealed((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !resetIds.has(id))));
      setFeedback((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !resetIds.has(id))));
    }
    setScreen("practice");
    closeDrawers();
    focusQuestion();
  }

  function startTypePractice(selectedType: TheoryType, label: string) {
    const typedQuestions = questions.filter((question) => question.type === selectedType);
    const firstUnanswered = typedQuestions.findIndex((question) => !answeredIds[question.id]);
    beginPractice(
      typedQuestions.map((question) => question.id),
      firstUnanswered < 0 ? 0 : firstUnanswered,
      `${label} · 完整 ${typedQuestions.length} 题`,
      false,
    );
  }

  async function resetTypeProgress(selectedType: TheoryType, label: string) {
    if (!requireSignIn()) return;
    if (!window.confirm(`确认重置${label}进度？该题型的作答记录将被清除，收藏不会删除。`)) return;

    const questionIds = new Set(questions.filter((question) => question.type === selectedType).map((question) => question.id));
    const removedPending = [...pendingAnswersRef.current].filter(([id]) => questionIds.has(id));
    for (const [id] of removedPending) pendingAnswersRef.current.delete(id);
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    setResettingType(selectedType);
    setActionError("");
    try {
      const response = await fetch("/api/progress/reset", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "theory", type: selectedType }),
      });
      if (!response.ok) throw new Error("reset failed");
    } catch {
      for (const [id, value] of removedPending) pendingAnswersRef.current.set(id, value);
      if (pendingAnswersRef.current.size) progressTimerRef.current = window.setTimeout(() => flushProgress(), 900);
      setResettingType(null);
      setActionError("题型进度重置失败，请稍后重试。");
      return;
    }

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const withoutType = <T,>(current: Record<string, T>) => Object.fromEntries(
      Object.entries(current).filter(([id]) => !questionIds.has(id)),
    );
    setAnsweredIds(withoutType);
    setAnswers(withoutType);
    setFeedback(withoutType);
    setRevealed(withoutType);
    setWrongIds((current) => current.filter((id) => !questionIds.has(id)));
    localStorage.removeItem(RESUME_KEY);
    if (pendingAnswersRef.current.size) progressTimerRef.current = window.setTimeout(() => flushProgress(), 900);
    setResettingType(null);
  }

  function startSavedPractice(kind: "wrong" | "favorite") {
    if (!requireSignIn()) return;
    const ids = kind === "wrong" ? wrongIds : Object.keys(favorites).filter((id) => favorites[id]);
    if (!ids.length) {
      setActionError(kind === "wrong" ? "目前没有错题记录，先完成一些理论练习吧。" : "目前还没有收藏理论题。");
      closeDrawers();
      return;
    }
    beginPractice(ids, 0, kind === "wrong" ? `错题重练 · ${ids.length} 题` : `收藏练习 · ${ids.length} 题`);
  }

  function choose(question: TheoryQuestion, value: string) {
    if (!requireSignIn()) return;
    if (revealed[question.id]) return;
    if (question.type === "multi") {
      setAnswers((current) => {
        const existing = current[question.id] ?? [];
        return { ...current, [question.id]: existing.includes(value) ? existing.filter((item) => item !== value) : [...existing, value] };
      });
      return;
    }
    const answer = [value];
    setAnswers((current) => ({ ...current, [question.id]: answer }));
    void submit(question, answer);
  }

  function submit(question: TheoryQuestion, answerOverride?: string[]) {
    if (!requireSignIn()) return;
    const answer = answerOverride ?? answers[question.id] ?? [];
    if (!answer.length || revealed[question.id]) return;
    setActionError("");
    const correct = isCorrect(question, answer);
    setAnsweredIds((current) => ({ ...current, [question.id]: true }));
    setFeedback((current) => ({ ...current, [question.id]: correct }));
    setRevealed((current) => ({ ...current, [question.id]: true }));
    if (!correct) setWrongIds((current) => current.includes(question.id) ? current : [question.id, ...current]);
    else setWrongIds((current) => current.filter((id) => id !== question.id));
    queueProgress(question.id, answer);
    if (correct) {
      if (autoAdvanceTimerRef.current !== null) window.clearTimeout(autoAdvanceTimerRef.current);
      const cancelAutoAdvance = () => {
        if (autoAdvanceTimerRef.current === null) return;
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
        setAutoAdvancing(false);
        document.removeEventListener("pointerdown", cancelAutoAdvance);
        document.removeEventListener("wheel", cancelAutoAdvance);
      };
      setAutoAdvancing(true);
      document.addEventListener("pointerdown", cancelAutoAdvance);
      document.addEventListener("wheel", cancelAutoAdvance, { passive: true });
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        setAutoAdvancing(false);
        document.removeEventListener("pointerdown", cancelAutoAdvance);
        document.removeEventListener("wheel", cancelAutoAdvance);
        if (currentIndex === sessionQuestions.length - 1) completePractice();
        else goToQuestion(currentIndex + 1);
      }, CORRECT_AUTO_ADVANCE_MS);
    }
  }

  async function toggleFavorite(questionId: string) {
    if (!requireSignIn()) return;
    setActionError("");
    const active = !favorites[questionId];
    setFavorites((current) => ({ ...current, [questionId]: active }));
    const response = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType: "theory", itemId: questionId, active }) });
    if (!response.ok) {
      setFavorites((current) => ({ ...current, [questionId]: !active }));
      setActionError("收藏状态保存失败，请重试");
    }
  }

  function goToQuestion(index: number) {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const boundedIndex = Math.max(0, Math.min(sessionQuestions.length - 1, index));
    setCurrentIndex(boundedIndex);
    setPalettePage(Math.floor(boundedIndex / QUESTION_MAP_PAGE_SIZE));
    setPaletteOpen(false);
    focusQuestion();
  }

  function openQuestionMap() {
    setPalettePage(Math.floor(currentIndex / QUESTION_MAP_PAGE_SIZE));
    setPaletteOpen(true);
  }

  function completePractice() {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    localStorage.removeItem(RESUME_KEY);
    setPersistSession(false);
    setScreen("result");
    closeDrawers();
  }

  const wrongIdSet = useMemo(() => new Set(wrongIds), [wrongIds]);

  function questionState(question: TheoryQuestion, index: number): string {
    if (feedback[question.id] === true) return "correct";
    if (feedback[question.id] === false) return "wrong";
    if ((answers[question.id] ?? []).length) return "selected";
    // 进入错题重练会清掉这些题的本轮作答与判分，好让学员重新作答；但错题本身是持久
    // 记录，不能因此在题号地图上消失。feedback 缺席时回退到错题集，答对后 choose()
    // 会把题目移出 wrongIds，标记随之消失。
    if (wrongIdSet.has(question.id)) return "wrong";
    if (index === currentIndex) return "current";
    return "unanswered";
  }

  const palettePageCount = Math.max(1, Math.ceil(sessionQuestions.length / QUESTION_MAP_PAGE_SIZE));
  const safePalettePage = Math.min(palettePage, palettePageCount - 1);
  const paletteStart = safePalettePage * QUESTION_MAP_PAGE_SIZE;
  const paletteEnd = Math.min(paletteStart + QUESTION_MAP_PAGE_SIZE, sessionQuestions.length);

  function renderQuestionNumbers() {
    return <>
      {palettePageCount > 1 && <div className="question-map-ranges" aria-label="题号分段">{Array.from({ length: palettePageCount }, (_, page) => {
        const start = page * QUESTION_MAP_PAGE_SIZE + 1;
        const end = Math.min((page + 1) * QUESTION_MAP_PAGE_SIZE, sessionQuestions.length);
        return <button type="button" key={page} className={page === safePalettePage ? "active" : ""} aria-pressed={page === safePalettePage} aria-label={`显示第 ${start} 至 ${end} 题`} onClick={() => { setPalettePage(page); questionGridRef.current?.scrollTo({ top: 0 }); }}>{start}–{end}</button>;
      })}</div>}
      <div className="question-number-grid" ref={questionGridRef}>{sessionQuestions.slice(paletteStart, paletteEnd).map((question, offset) => {
        const index = paletteStart + offset;
        return <button
          type="button"
          key={question.id}
          className={`${questionState(question, index)} ${index === currentIndex ? "active" : ""}`}
          aria-label={`第 ${index + 1} 题${feedback[question.id] === true ? "，正确" : feedback[question.id] === false ? "，错误" : ""}`}
          aria-current={index === currentIndex ? "step" : undefined}
          onClick={() => goToQuestion(index)}
        >{index + 1}</button>;
      })}</div>
    </>;
  }

  const activeNavLabel = screen === "practice" ? sessionLabel : "练习结果";
  const drawerVisible = navOpen || paletteOpen;

  return <div className={`theory-study-layout ${screen === "practice" ? "with-palette" : ""}`}>
    <button type="button" className="theory-mobile-nav-trigger" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><span>练习导航</span><b>{activeNavLabel}</b><i>☰</i></button>
    {drawerVisible && <button type="button" className="theory-drawer-backdrop" aria-label="关闭导航" onClick={closeDrawers} />}

    <aside className={`theory-study-nav ${navOpen ? "open" : ""}`} aria-label="理论练习导航">
      <div className="theory-side-head"><div><span>THEORY DESK</span><b>理论学习台</b></div><button type="button" aria-label="关闭练习导航" onClick={() => setNavOpen(false)}>×</button></div>
      <nav>
        <section>
          <p>题型进度</p>
          {typeProgress.map((item) => <div className="theory-type-progress-row" key={item.type}>
            <button type="button" className="theory-type-progress-entry" onClick={() => startTypePractice(item.type, item.label)}>
              <span>{item.label}<em>{item.answered}/{item.total}</em></span>
              <small>{item.answered === item.total ? "已完成全部题目" : `剩余 ${item.total - item.answered} 题 · 点击继续`}</small>
              <i className="theory-type-progress-track" aria-hidden="true"><i style={{ width: `${item.total ? item.answered / item.total * 100 : 0}%` }} /></i>
            </button>
            <button type="button" className="theory-type-progress-reset" disabled={resettingType !== null || item.answered === 0} onClick={() => void resetTypeProgress(item.type, item.label)}>{resettingType === item.type ? "…" : "重置"}</button>
          </div>)}
        </section>
        <section>
          <p>复习清单</p>
          <button type="button" onClick={() => startSavedPractice("wrong")}><span>错题重练 <em>{wrongIds.length}</em></span><small>答对后移出错题集</small></button>
          <button type="button" onClick={() => startSavedPractice("favorite")}><span>收藏练习 <em>{favoriteCount}</em></span><small>集中复习重点题</small></button>
        </section>
      </nav>
    </aside>

    <div className="theory-study-content">
      {actionError && <div className="account-error theory-action-error" role="alert">{actionError}</div>}

      {screen === "practice" && currentQuestion && <section className="practice-session">
        <div className="practice-question-toolbar">
          <div className="practice-progress" aria-label={`练习进度 ${currentIndex + 1}/${sessionQuestions.length}`}><i style={{ width: `${(currentIndex + 1) / sessionQuestions.length * 100}%` }} /></div>
          <button type="button" className="question-map-trigger" aria-expanded={paletteOpen} onClick={openQuestionMap}><b>{currentIndex + 1}</b> / {sessionQuestions.length}<span>题号导航</span></button>
        </div>
        <article className="practice-question-card" ref={questionCardRef} tabIndex={-1}>
          <div className="question-meta"><div className="question-meta-left"><span className="question-number">题库 #{String(currentQuestion.index).padStart(3, "0")}</span><span className="chip">{currentQuestion.typeLabel}</span>{currentQuestion.type === "multi" && <span className="chip">可多选</span>}</div><small className="practice-question-context">{currentQuestion.category} · {currentQuestion.section}</small></div>
          <h2 className="practice-question-title">{currentQuestion.stem}</h2>
          <div className="practice-options">{(currentQuestion.type === "judge" ? ["√", "×"] : currentQuestion.options.map((_, index) => LETTERS[index])).map((value, index) => {
            const selected = (answers[currentQuestion.id] ?? []).includes(value);
            const correct = revealed[currentQuestion.id] && currentQuestion.answer.includes(value);
            const incorrect = revealed[currentQuestion.id] && selected && !correct;
            return <label className={`practice-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${incorrect ? "incorrect" : ""}`} key={value}>
              <input type={currentQuestion.type === "multi" ? "checkbox" : "radio"} name={currentQuestion.id} checked={selected} disabled={revealed[currentQuestion.id]} onChange={() => choose(currentQuestion, value)} />
              <b>{value}</b><span>{currentQuestion.type === "judge" ? (value === "√" ? "正确" : "错误") : currentQuestion.options[index]}</span>
            </label>;
          })}</div>

          {revealed[currentQuestion.id] && <div className={`practice-feedback ${feedback[currentQuestion.id] ? "correct" : "wrong"}`} aria-live="polite">
            <div><strong>{feedback[currentQuestion.id] ? "回答正确" : "回答错误"}</strong><b>参考答案：{currentQuestion.answer.join("、")}</b></div>
            <p>{currentQuestion.explanation}</p>
            {/* 答对会自动跳到下一题。不明说的话，用户会以为页面自己跳了；也要让他知道
                想留下看解析只需点一下或滚动一下。取消后提示改为「已停留」，不再倒计时。 */}
            {feedback[currentQuestion.id] && <p className={`practice-auto-advance ${autoAdvancing ? "is-running" : "is-paused"}`} aria-live="polite">
              {/* 拆成两个短语各自成为一个 flex 项：390px 下这行放不下，整句排版会在
                  「停留」前断开，末行只剩两个字。拆开后换行发生在短语之间。 */}
              {autoAdvancing
                ? <><span className="practice-auto-advance-bar" aria-hidden="true" /><span>正在自动进入下一题</span><span>点击或滚动可停留</span></>
                : <span>已停留在本题，随时可点「下一题」继续</span>}
            </p>}
          </div>}

          <div className="practice-bottom-bar">
            <button type="button" className="button button-quiet" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>上一题</button>
            <button type="button" className="button button-quiet favorite-action" aria-pressed={Boolean(favorites[currentQuestion.id])} onClick={() => void toggleFavorite(currentQuestion.id)}>{favorites[currentQuestion.id] ? "★ 已收藏" : "☆ 收藏"}</button>
            {!revealed[currentQuestion.id] && currentIndex < sessionQuestions.length - 1 && <button type="button" className="button button-quiet skip-action" onClick={() => goToQuestion(currentIndex + 1)}>暂不作答</button>}
            {revealed[currentQuestion.id]
              ? <button type="button" className="button button-primary primary-action" onClick={() => currentIndex === sessionQuestions.length - 1 ? completePractice() : goToQuestion(currentIndex + 1)}>{currentIndex === sessionQuestions.length - 1 ? "查看本组结果" : "下一题"}</button>
              : currentQuestion.type === "multi"
                ? <button type="button" className="button button-primary primary-action" disabled={!(answers[currentQuestion.id] ?? []).length} onClick={() => void submit(currentQuestion)}>提交多选答案</button>
                : <button type="button" className="button button-primary primary-action" disabled>选择答案后自动判分</button>}
          </div>
        </article>
      </section>}

      {screen === "result" && <section className="theory-result-panel">
        <span className="eyebrow">PRACTICE COMPLETE</span><h2>本组练习完成</h2><p>{sessionLabel}</p>
        <div><article><strong>{answeredCount}</strong><span>已答题</span></article><article><strong>{correctCount}</strong><span>答对题</span></article><article><strong>{correctRate}%</strong><span>正确率</span></article></div>
        <div className="hero-actions">{sessionWrongIds.length > 0 && <button type="button" className="button button-primary" onClick={() => beginPractice(sessionWrongIds, 0, `本组错题 · ${sessionWrongIds.length} 题`)}>重练本组错题</button>}<button type="button" className="button button-primary" onClick={() => beginPractice(shuffled(sessionIds), 0, `${sessionLabel} · 随机重排`)}>随机重排本组</button></div>
      </section>}
    </div>

    {screen === "practice" && <aside className={`practice-palette ${paletteOpen ? "open" : ""}`} aria-label="本组题号导航">
      <div className="theory-side-head"><div><span>QUESTION MAP</span><b>本组题目</b></div><button type="button" aria-label="关闭题号导航" onClick={() => setPaletteOpen(false)}>×</button></div>
      <div className="practice-palette-summary"><strong>{currentIndex + 1}<small> / {sessionQuestions.length}</small></strong><span>{sessionLabel}</span></div>
      <div className="practice-palette-stats"><span><b>{answeredCount}</b>已答</span><span><b>{correctCount}</b>正确</span><span><b>{correctRate}%</b>正确率</span></div>
      <div className="practice-palette-head"><b>第 {paletteStart + 1}–{paletteEnd} 题</b><small>{sessionQuestions.length - answeredCount} 道未答</small></div>
      {renderQuestionNumbers()}
      <div className="question-state-legend"><span><i className="correct" />正确</span><span><i className="wrong" />错误</span><span><i className="selected" />已选</span><span><i />未答</span></div>
      <p className="practice-shortcuts"><b>键盘快捷键</b><span>1–4 选择答案</span><span>Enter 提交多选 / 下一题</span></p>
    </aside>}
  </div>;
}
