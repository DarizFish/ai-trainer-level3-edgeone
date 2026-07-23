"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TheoryQuestion, TheoryType } from "@/lib/content";
import { isCorrect } from "@/lib/scoring";
import { useAccountSession } from "./AccountSession";
import { SourceBadge } from "./SourceBadge";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const RESUME_KEY = "ai-trainer-theory-session-v6";
const QUESTION_MAP_PAGE_SIZE = 50;

const TYPE_OPTIONS: { value: TheoryType | "all"; label: string }[] = [
  { value: "all", label: "全部题型" },
  { value: "judge", label: "判断题" },
  { value: "single", label: "单选题" },
  { value: "multi", label: "多选题" },
];

type AnswerFilter = "all" | "official" | "reference" | "reviewed" | "heuristic";

const SOURCE_OPTIONS: { value: AnswerFilter; label: string }[] = [
  { value: "all", label: "全部答案" },
  { value: "official", label: "指导手册" },
  { value: "reference", label: "公开参考题库" },
  { value: "reviewed", label: "本站逐题复核" },
  { value: "heuristic", label: "本站知识点整理" },
];

type Screen = "practice" | "result" | "build" | "browse";
type PracticeOrder = "sequential" | "random";
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

function matchesAnswerFilter(question: TheoryQuestion, filter: AnswerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "official") return question.answerSource === "official";
  if (filter === "reference") return question.answerBasis === "third_party_reference";
  if (filter === "reviewed") return question.answerBasis === "editorial_review";
  return question.answerBasis === "heuristic";
}

export default function TheoryPractice({ questions, contentVersion }: { questions: TheoryQuestion[]; contentVersion: string }) {
  const { status: accountStatus } = useAccountSession();
  const signedIn = accountStatus === "authenticated";
  const defaultIds = useMemo(() => questions.filter((question) => question.type === "judge").map((question) => question.id), [questions]);
  const [screen, setScreen] = useState<Screen>("practice");
  const [type, setType] = useState<TheoryType | "all">("all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState<AnswerFilter>("all");
  const [order, setOrder] = useState<PracticeOrder>("sequential");
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
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePage, setPalettePage] = useState(0);
  const questionCardRef = useRef<HTMLElement>(null);
  const questionGridRef = useRef<HTMLDivElement>(null);
  const pendingAnswersRef = useRef(new Map<string, { answer: string[]; attempts: number }>());
  const progressTimerRef = useRef<number | null>(null);

  const [query, setQuery] = useState("");
  const [browsePage, setBrowsePage] = useState(1);
  const [browseType, setBrowseType] = useState<TheoryType | "all">("all");
  const [browseCategory, setBrowseCategory] = useState("all");
  const [browseSource, setBrowseSource] = useState<AnswerFilter>("all");
  const pageSize = 10;

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const { categories, categoryCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
    }
    return { categories: [...counts.keys()], categoryCounts: counts };
  }, [questions]);

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
        setAnswers(restoredAnswers);
        setFeedback(restoredFeedback);
        setRevealed(Object.fromEntries(Object.keys(restoredFeedback).map((id) => [id, true])));
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
        ? await response.json() as { favoriteIds: string[]; wrongIds: string[] }
        : { favoriteIds: [], wrongIds: [] })
      .then((state) => {
        setFavorites(Object.fromEntries(state.favoriteIds.map((id) => [id, true])));
        setWrongIds(state.wrongIds);
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

  const configuredQuestions = useMemo(() => questions.filter((question) => (
    (type === "all" || question.type === type)
    && (category === "all" || question.category === category)
    && matchesAnswerFilter(question, source)
  )), [category, questions, source, type]);

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

  useEffect(() => {
    if (screen !== "practice") return;
    questionGridRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentIndex, palettePage, screen]);

  const filteredBrowse = useMemo(() => questions.filter((question) => {
    const text = `${question.stem} ${question.section}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (browseType === "all" || question.type === browseType)
      && (browseCategory === "all" || question.category === browseCategory)
      && matchesAnswerFilter(question, browseSource);
  }), [browseCategory, browseSource, browseType, query, questions]);
  const browsePages = Math.max(1, Math.ceil(filteredBrowse.length / pageSize));
  const currentBrowsePage = Math.min(browsePage, browsePages);
  const visibleBrowse = filteredBrowse.slice((currentBrowsePage - 1) * pageSize, currentBrowsePage * pageSize);

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
    pendingAnswersRef.current.clear();
    const body = JSON.stringify({ attempts });

    if (preferBeacon && navigator.sendBeacon) {
      const queued = navigator.sendBeacon("/api/theory/answer", new Blob([body], { type: "application/json" }));
      if (queued) return;
    }

    void fetch("/api/theory/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error("progress sync failed");
    }).catch(() => {
      for (const item of attempts) {
        const current = pendingAnswersRef.current.get(item.questionId);
        pendingAnswersRef.current.set(item.questionId, {
          answer: current?.answer ?? item.answer,
          attempts: (current?.attempts ?? 0) + item.attempts,
        });
      }
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

  function beginPractice(ids: string[], startIndex = 0, label = "当前练习") {
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
    setAnswers({});
    setRevealed({});
    setFeedback({});
    setScreen("practice");
    closeDrawers();
    focusQuestion();
  }

  function startConfiguredPractice(selectedOrder: PracticeOrder = order) {
    let selected = configuredQuestions.map((question) => question.id);
    if (selectedOrder === "random") selected = shuffled(selected);
    const typeLabel = TYPE_OPTIONS.find((item) => item.value === type)?.label ?? "全部题型";
    const scopeLabel = category === "all" ? typeLabel : `${category} · ${typeLabel}`;
    beginPractice(selected, 0, `${scopeLabel} · ${selectedOrder === "random" ? "随机" : "顺序"}`);
  }

  function startQuickPractice(predicate: (question: TheoryQuestion) => boolean, label: string, random = false) {
    const pool = questions.filter(predicate);
    const selected = (random ? shuffled(pool) : pool).map((question) => question.id);
    beginPractice(selected, 0, label);
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
    setFeedback((current) => ({ ...current, [question.id]: correct }));
    setRevealed((current) => ({ ...current, [question.id]: true }));
    if (!correct) setWrongIds((current) => current.includes(question.id) ? current : [question.id, ...current]);
    else setWrongIds((current) => current.filter((id) => id !== question.id));
    queueProgress(question.id, answer);
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
    localStorage.removeItem(RESUME_KEY);
    setPersistSession(false);
    setScreen("result");
    closeDrawers();
  }

  function showScreen(nextScreen: Screen) {
    setActionError("");
    setScreen(nextScreen);
    closeDrawers();
  }

  function browseFilter(action: () => void) {
    action();
    setBrowsePage(1);
  }

  function questionState(question: TheoryQuestion, index: number): string {
    if (feedback[question.id] === true) return "correct";
    if (feedback[question.id] === false) return "wrong";
    if ((answers[question.id] ?? []).length) return "selected";
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

  const activeNavLabel = screen === "practice" ? sessionLabel : screen === "result" ? "练习结果" : screen === "build" ? "专项组题" : "题库检索";
  const drawerVisible = navOpen || paletteOpen;

  return <div className={`theory-study-layout ${screen === "practice" ? "with-palette" : ""}`}>
    <button type="button" className="theory-mobile-nav-trigger" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><span>练习导航</span><b>{activeNavLabel}</b><i>☰</i></button>
    {drawerVisible && <button type="button" className="theory-drawer-backdrop" aria-label="关闭导航" onClick={closeDrawers} />}

    <aside className={`theory-study-nav ${navOpen ? "open" : ""}`} aria-label="理论练习导航">
      <div className="theory-side-head"><div><span>THEORY DESK</span><b>理论学习台</b></div><button type="button" aria-label="关闭练习导航" onClick={() => setNavOpen(false)}>×</button></div>
      <nav>
        <section>
          <p>当前与常用</p>
          <button type="button" className={screen === "practice" || screen === "result" ? "active" : ""} onClick={() => showScreen(screen === "result" ? "result" : "practice")}><span>{screen === "result" ? "本组结果" : "当前练习"}</span><small>{sessionLabel} · {currentIndex + 1}/{sessionQuestions.length}</small></button>
          <button type="button" onClick={() => startQuickPractice((question) => question.type === "judge", "判断题 · 完整 300 题")}><span>判断题 300 题</span><small>完整刷完判断题题库</small></button>
          <button type="button" onClick={() => startQuickPractice((question) => question.type === "single", "单选题 · 完整 300 题")}><span>单选题 300 题</span><small>完整刷完单选题题库</small></button>
          <button type="button" onClick={() => startQuickPractice((question) => question.type === "multi", "多选题 · 完整 300 题")}><span>多选题 300 题</span><small>完整刷完多选题题库</small></button>
          <button type="button" onClick={() => startSavedPractice("wrong")}><span>错题重练 <em>{wrongIds.length}</em></span><small>答对后移出错题集</small></button>
          <button type="button" onClick={() => startSavedPractice("favorite")}><span>收藏练习 <em>{favoriteCount}</em></span><small>集中复习重点题</small></button>
        </section>
        <section>
          <p>知识领域</p>
          {categories.map((item) => <button type="button" key={item} onClick={() => startQuickPractice((question) => question.category === item, `${item} · 完整 ${categoryCounts.get(item)} 题`)}><span>{item}</span><small>完整练习 {categoryCounts.get(item)} 道题</small></button>)}
        </section>
        <section>
          <p>题库与考试</p>
          <button type="button" className={screen === "build" ? "active" : ""} onClick={() => showScreen("build")}><span>专项组题</span><small>按题型、领域和来源组合</small></button>
          <button type="button" className={screen === "browse" ? "active" : ""} onClick={() => showScreen("browse")}><span>题库检索</span><small>搜索并查看 900 道题</small></button>
          <Link href="/theory/mock"><span>模拟考试</span><small>190 题 · 90 分钟</small></Link>
        </section>
      </nav>
    </aside>

    <div className="theory-study-content">
      {actionError && <div className="account-error theory-action-error" role="alert">{actionError}</div>}

      {screen === "practice" && currentQuestion && <section className="practice-session">
        <header className="practice-focus-head">
          <div><span className="eyebrow">{sessionLabel} · 第 {currentIndex + 1}/{sessionQuestions.length} 题</span><h2>{currentQuestion.category} · {currentQuestion.section}</h2></div>
          <button type="button" className="question-map-trigger" aria-expanded={paletteOpen} onClick={openQuestionMap}><b>{currentIndex + 1}</b> / {sessionQuestions.length}<span>题号导航</span></button>
        </header>
        <div className="practice-progress" aria-label={`练习进度 ${currentIndex + 1}/${sessionQuestions.length}`}><i style={{ width: `${(currentIndex + 1) / sessionQuestions.length * 100}%` }} /></div>
        <article className="practice-question-card" ref={questionCardRef} tabIndex={-1}>
          <div className="question-meta"><div className="question-meta-left"><span className="question-number">题库 #{String(currentQuestion.index).padStart(3, "0")}</span><span className="chip">{currentQuestion.typeLabel}</span>{currentQuestion.type === "multi" && <span className="chip">可多选</span>}</div><SourceBadge source={currentQuestion.answerSource} basis={currentQuestion.answerBasis} /></div>
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
            <div><strong>{feedback[currentQuestion.id] ? "回答正确" : "回答错误"}</strong><b>参考答案：{currentQuestion.answer.join("、")}</b><SourceBadge source={currentQuestion.answerSource} basis={currentQuestion.answerBasis} /></div>
            <p>{currentQuestion.explanation}</p>
            {currentQuestion.answerBasis === "third_party_reference" && <small>核对说明：公开参考题库与本题的题型、序号、题干和选项全部严格匹配；该来源独立于指导手册。</small>}
            {currentQuestion.answerBasis === "editorial_review" && <small>复核说明：本站已按完整题干和选项逐题复核，并用内容哈希锁定记录；该答案不属于指导手册官方答案。</small>}
            {currentQuestion.answerBasis === "heuristic" && <small>整理说明：指导手册和公开参考题库均未提供可严格匹配的答案，本站依据对应知识点整理，建议结合解析复核。</small>}
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
        <div className="hero-actions">{sessionWrongIds.length > 0 && <button type="button" className="button button-primary" onClick={() => beginPractice(sessionWrongIds, 0, `本组错题 · ${sessionWrongIds.length} 题`)}>重练本组错题</button>}<button type="button" className="button button-primary" onClick={() => beginPractice(shuffled(sessionIds), 0, `${sessionLabel} · 随机重排`)}>随机重排本组</button><button type="button" className="button button-quiet" onClick={() => showScreen("build")}>选择其他题型</button></div>
      </section>}

      {screen === "build" && <section className="theory-builder-panel">
        <header><div><span className="eyebrow">CUSTOM PRACTICE</span><h2>自定义完整练习</h2><p>按题型、知识领域和答案来源筛选，符合条件的题目一次全部加入。</p></div><strong>{configuredQuestions.length}<small> 道符合条件</small></strong></header>
        <div className="theory-builder-grid">
          <fieldset><legend>1. 选择题型</legend><div className="choice-chips">{TYPE_OPTIONS.map((item) => <button type="button" key={item.value} className={type === item.value ? "active" : ""} onClick={() => setType(item.value)}>{item.label}</button>)}</div></fieldset>
          <fieldset className="full"><legend>2. 选择知识领域</legend><div className="choice-chips"><button type="button" className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>全部领域</button>{categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></fieldset>
          <fieldset><legend>3. 答案来源</legend><div className="choice-chips">{SOURCE_OPTIONS.map((item) => <button type="button" key={item.value} className={source === item.value ? "active" : ""} onClick={() => setSource(item.value)}>{item.label}</button>)}</div></fieldset>
          <fieldset><legend>4. 出题顺序</legend><div className="choice-chips"><button type="button" className={order === "sequential" ? "active" : ""} onClick={() => setOrder("sequential")}>顺序</button><button type="button" className={order === "random" ? "active" : ""} onClick={() => setOrder("random")}>随机</button></div></fieldset>
        </div>
        <footer><div><b>将完整加入 {configuredQuestions.length} 道题</b><small>判断和单选选择后立即判分，多选提交后判分。</small></div><button type="button" className="button button-primary" disabled={!configuredQuestions.length || accountStatus === "loading"} onClick={() => startConfiguredPractice()}>{accountStatus === "loading" ? "正在确认账号…" : signedIn ? "开始完整练习" : "登录并开始练习"}</button></footer>
      </section>}

      {screen === "browse" && <section className="theory-browser">
        <div className="browse-toolbar">
          <div className="catalog-search"><label htmlFor="theory-search">搜索题目</label><input id="theory-search" className="field" value={query} onChange={(event) => browseFilter(() => setQuery(event.target.value))} placeholder="题干或知识点…" /></div>
          <div className="browse-filter-row" aria-label="题型筛选">{TYPE_OPTIONS.map((item) => <button type="button" key={item.value} className={browseType === item.value ? "active" : ""} onClick={() => browseFilter(() => setBrowseType(item.value))}>{item.label}</button>)}</div>
          <div className="browse-filter-row" aria-label="知识领域筛选"><button type="button" className={browseCategory === "all" ? "active" : ""} onClick={() => browseFilter(() => setBrowseCategory("all"))}>全部领域</button>{categories.map((item) => <button type="button" key={item} className={browseCategory === item ? "active" : ""} onClick={() => browseFilter(() => setBrowseCategory(item))}>{item}</button>)}</div>
          <div className="browse-filter-row" aria-label="答案来源筛选">{SOURCE_OPTIONS.map((item) => <button type="button" key={item.value} className={browseSource === item.value ? "active" : ""} onClick={() => browseFilter(() => setBrowseSource(item.value))}>{item.label}</button>)}</div>
        </div>
        <div className="result-bar"><span>找到 <b>{filteredBrowse.length}</b> 道题 · 第 {currentBrowsePage}/{browsePages} 页</span><span className="notice">题库用于检索和查答案；连续作答请使用左侧练习导航。</span></div>
        <div className="theory-browser-list">{visibleBrowse.map((question) => <article className="theory-browser-card" key={question.id}>
          <div className="question-meta"><div className="question-meta-left"><span className="question-number">#{String(question.index).padStart(3, "0")}</span><span className="chip">{question.typeLabel}</span><span className="chip">{question.category}</span><span className="chip">{question.section}</span></div><SourceBadge source={question.answerSource} basis={question.answerBasis} /></div>
          <h2>{question.stem}</h2>
          {question.type !== "judge" && <ol>{question.options.map((option, index) => <li key={option}><b>{LETTERS[index]}.</b> {option}</li>)}</ol>}
          <div className="question-actions"><button className="button button-primary" disabled={accountStatus === "loading"} onClick={() => beginPractice([question.id], 0, "单题练习")}>{accountStatus === "loading" ? "正在确认账号…" : signedIn ? "练这一题" : "登录后练习"}</button><button className="button button-quiet" onClick={() => setRevealed((current) => ({ ...current, [question.id]: !current[question.id] }))}>{revealed[question.id] ? "收起答案" : "查看参考答案"}</button><button className="button button-quiet" onClick={() => void toggleFavorite(question.id)}>{favorites[question.id] ? "★ 已收藏" : "☆ 收藏"}</button></div>
          {revealed[question.id] && <div className="answer-panel"><div className="answer-line"><b>参考答案：{question.answer.join("、")}</b><SourceBadge source={question.answerSource} basis={question.answerBasis} /><span className="chip">可信度：{question.confidence === "high" ? "高" : question.confidence === "medium" ? "中" : "低"}</span></div><p>{question.explanation}</p>{question.answerBasis === "third_party_reference" && <small>核对说明：公开参考题库与本题题型、序号、题干和选项全部严格匹配；该来源独立于指导手册。</small>}{question.answerBasis === "editorial_review" && <small>复核说明：本站已按完整题干和选项逐题复核，并用内容哈希锁定记录；该答案不属于指导手册官方答案。</small>}{question.answerBasis === "heuristic" && <small>整理说明：暂无可严格匹配的手册或公开题库答案，本站依据对应知识点整理，建议结合解析复核。</small>}</div>}
        </article>)}</div>
        {browsePages > 1 && <div className="pagination"><button disabled={currentBrowsePage === 1} onClick={() => setBrowsePage(currentBrowsePage - 1)}>‹</button><span>第 {currentBrowsePage} / {browsePages} 页</span><button disabled={currentBrowsePage === browsePages} onClick={() => setBrowsePage(currentBrowsePage + 1)}>›</button></div>}
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
