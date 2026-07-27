"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [syncNote, setSyncNote] = useState("");
  const revisionRef = useRef(0);
  // 键里不再嵌评分表指纹。原先带 `${answerBasis}-${referenceAnswer.length}-M1:6-…`，
  // 只要参考答案或评分点分值一改，键就变了，用户此前写的内容会静默变成孤儿——补一句
  // 官方口径都会触发。restoreDraft 本来就按 sectionIds 与 scoreLimits 逐项校验，
  // 题目结构变化会被安全丢弃，不需要靠换键来防御。旧键仍然读，用于迁移。
  const storageKey = useMemo(() => exercise && userEmail
    ? `ai-trainer-business-answer-sheet-v2:${encodeURIComponent(userEmail)}:${task.code}`
    : null, [exercise, task.code, userEmail]);
  const legacyStorageKeys = useMemo(() => {
    if (!exercise || !userEmail) return [];
    const owner = encodeURIComponent(userEmail);
    const keys = [`ai-trainer-business-answer-sheet-v1:${owner}:${task.code}:${exercise.storageVersion}`];
    if (task.group === "3.1") keys.push(`ai-trainer-practical-response-v3:${owner}:${task.code}:${exercise.storageVersion}`);
    return keys;
  }, [exercise, task.code, task.group, userEmail]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const sectionIds = new Set(exercise?.sections.map((section) => section.id) ?? []);
      const scoreLimits = new Map(exercise?.sections.flatMap((section) => section.rubric).map((item) => [item.id, item.points]) ?? []);
      const serialized = storageKey
        ? localStorage.getItem(storageKey)
          ?? legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean)
          ?? ""
        : "";
      const local = storageKey ? restoreDraft(serialized, sectionIds, scoreLimits) : null;
      setAnswers(local?.answers ?? {});
      setScores(local?.scores ?? {});
      setRestored(true);
      if (!userEmail) return;
      // 云端草稿优先：本机内容只是离线缓存，换设备时应当拿到服务端那份。
      void fetch(`/api/drafts/${task.code}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { draft?: { cellsJson?: string; revision?: number } | null } | null) => {
          if (cancelled || !payload?.draft?.cellsJson) return;
          const cloud = restoreDraft(payload.draft.cellsJson, sectionIds, scoreLimits);
          revisionRef.current = payload.draft.revision ?? 0;
          if (!cloud) return;
          const hasCloudContent = Object.values(cloud.answers).some((value) => value.trim());
          const hasLocalContent = Object.values(local?.answers ?? {}).some((value) => value.trim());
          if (hasCloudContent || !hasLocalContent) {
            setAnswers(cloud.answers);
            setScores(cloud.scores);
          }
        })
        .catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [exercise, legacyStorageKeys, storageKey, task.code, userEmail]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, answers, scores } satisfies AnswerSheetDraft));
    if (!userEmail) return;
    // 防抖后同步到服务端。冲突时以云端为准并刷新 revision——答题卷是纯文本，
    // 直接采纳云端比弹一个合并界面更不容易让人丢内容。
    const timer = window.setTimeout(() => {
      void fetch(`/api/drafts/${task.code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answerSheet: { version: 1, answers, scores }, revision: revisionRef.current }),
      }).then(async (response) => {
        if (response.status === 409) {
          const conflict = await response.json() as { cloud?: { answers?: Record<string, string>; scores?: PracticalRubricScores }; revision?: number };
          revisionRef.current = conflict.revision ?? revisionRef.current;
          if (conflict.cloud?.answers) {
            setAnswers(conflict.cloud.answers);
            setScores(conflict.cloud.scores ?? {});
            setSyncNote("已载入其它设备上更新的作答。");
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
  }, [answers, restored, scores, storageKey, task.code, userEmail]);

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
      <footer>{reviewing ? <small>当前为学习复盘，不是官方考场评分。</small> : <small>{userEmail ? `已填写 ${answeredCount} / 2 问，${syncNote || "草稿已同步到账号，换设备可继续。"}` : "登录后可填写并保存答题卷。"}</small>}<button type="button" className={`button ${reviewing ? "button-quiet" : "button-primary"}`} onClick={() => setReviewing((value) => !value)}>{reviewing ? "返回作答" : "完成作答，进入复盘"}</button></footer>
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
