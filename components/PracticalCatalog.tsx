"use client";

import { useEffect, useMemo, useState } from "react";
import { examBlueprint } from "@/lib/exam-blueprint";
import { practicalMockEnabled } from "@/lib/features";
import { useAccountSession } from "./AccountSession";
import IntentLink from "./IntentLink";

export type PracticalCatalogTask = {
  category: string;
  code: string;
  descriptionExcerpt: string;
  durationMinutes: number;
  group: string;
  hasNotebook: boolean;
  materialSummary: string;
  maxScore: number;
  rubricCount: number;
  title: string;
  unit: string;
};

export default function PracticalCatalog({ tasks }: { tasks: PracticalCatalogTask[] }) {
  const { status: accountStatus } = useAccountSession();
  const [query, setQuery] = useState("");
  const [moduleKey, setModuleKey] = useState("all");
  const [labOnly, setLabOnly] = useState(false);
  const [resettingGroup, setResettingGroup] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("lab") === "1") {
      queueMicrotask(() => setLabOnly(true));
    }
  }, []);
  const groups = useMemo(() => [...new Set(tasks.map((task) => task.group))], [tasks]);
  const groupDetails = useMemo(() => groups.map((group) => ({
    group,
    category: tasks.find((task) => task.group === group)?.category ?? `章节 ${group}`,
    taskCodes: tasks.filter((task) => task.group === group).map((task) => task.code),
    notebookTaskCodes: tasks.filter((task) => task.group === group && task.hasNotebook).map((task) => task.code),
  })), [groups, tasks]);
  const selectedModule = examBlueprint.practical.modules.find((item) => item.key === moduleKey);
  const filtered = useMemo(() => tasks.filter((task) => (!query || `${task.code}${task.title}${task.descriptionExcerpt}`.toLowerCase().includes(query.toLowerCase())) && (!selectedModule || (selectedModule.groups as readonly string[]).includes(task.group)) && (!labOnly || task.hasNotebook)), [tasks, query, selectedModule, labOnly]);
  const visibleGroups = groups.filter((item) => filtered.some((task) => task.group === item));
  const hasActiveFilters = Boolean(query.trim() || moduleKey !== "all" || labOnly);

  function resetNavigation() { setQuery(""); setModuleKey("all"); setLabOnly(false); }

  async function resetGroupProgress(group: string, category: string, fallbackTaskCodes: string[], notebookTaskCodes: string[]) {
    if (accountStatus === "loading") {
      setResetMessage({ kind: "error", text: "正在确认账号状态，请稍候。" });
      return;
    }
    if (accountStatus !== "authenticated") {
      window.location.assign("/account?mode=login&return_to=%2Fpractical");
      return;
    }
    if (!window.confirm(`确认重置 ${group} ${category} 的实操进度？该章节的评分、作答与草稿将被清除。`)) return;

    setResettingGroup(group);
    setResetMessage(null);
    try {
      const response = await fetch("/api/progress/reset", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "practical", group }),
      });
      const data = await response.json().catch(() => null) as { error?: string; taskCodes?: string[] } | null;
      if (!response.ok) throw new Error(data?.error ?? "章节进度重置失败");

      const taskCodes = data?.taskCodes?.length ? data.taskCodes : fallbackTaskCodes;
      const draftPrefixes = [
        "ai-trainer-notebook:",
        "ai-trainer-draft:",
        "ai-trainer-business-answer-sheet-v1:",
        "ai-trainer-practical-response-v3:",
        "ai-trainer-practical-word-response-v1:",
        "ai-trainer-practical-notes-v1:",
        "ai-trainer-word-draft-v1:",
      ];
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key || !draftPrefixes.some((prefix) => key.startsWith(prefix))) continue;
        const segments = key.split(":");
        if (taskCodes.some((taskCode) => segments.includes(taskCode))) localStorage.removeItem(key);
      }
      for (const taskCode of taskCodes.filter((taskCode) => notebookTaskCodes.includes(taskCode))) {
        localStorage.setItem(`ai-trainer-practical-reset:${taskCode}`, "1");
      }
      setResetMessage({ kind: "success", text: `${group} ${category} 的进度已重置。` });
    } catch (error) {
      setResetMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "章节进度重置失败，请稍后重试。",
      });
    } finally {
      setResettingGroup(null);
    }
  }

  return <div id="practical-results" className="practical-catalog">
    <aside className="practical-catalog-sidebar" aria-label="实操题库导航">
      <header className="catalog-sidebar-head">
        <div className="breadcrumbs"><IntentLink href="/">首页</IntentLink>　/　实操题库</div>
        <h1>实操题库</h1>
        <p><b>40</b> 道题 · 8 个章节 · 20 个 Python 实验</p>
        {practicalMockEnabled && <nav aria-label="实操题库快捷入口"><IntentLink href="/practical/mock">实操组卷</IntentLink></nav>}
      </header>
      <section className="practical-score-map" aria-labelledby="practical-score-map-title">
        <header><div><p className="eyebrow">100 分构成</p><h2 id="practical-score-map-title">正式实操六模块分值</h2></div><p>点击模块筛选；业务分析与培训/指导各二选一。</p></header>
        <div className="practical-score-track">{examBlueprint.practical.modules.map((item, index) => <button type="button" key={item.key} className={moduleKey === item.key ? "active" : ""} onClick={() => setModuleKey(moduleKey === item.key ? "all" : item.key)} aria-pressed={moduleKey === item.key}>
          <span>{index + 1}</span><b>{item.label}</b><strong>{item.maxScore}<small> 分</small></strong><em>{item.groups.join(" / ")}{item.groups.length > 1 ? " 二选一" : ""}</em>
        </button>)}</div>
      </section>
      <section className="catalog-controls" aria-label="实操题库筛选">
        <div className="catalog-search"><label htmlFor="practical-search">搜索题目</label><input id="practical-search" className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入题号、题目或场景…" /></div>
        <div className="catalog-scope-buttons" role="group" aria-label="题目类型"><button type="button" className={!labOnly ? "active" : ""} aria-pressed={!labOnly} onClick={() => setLabOnly(false)}>全部 40 题</button><button type="button" className={labOnly ? "active" : ""} aria-pressed={labOnly} onClick={() => setLabOnly(true)}>Python 20 题</button>{hasActiveFilters && <button type="button" className="clear" onClick={resetNavigation}>重置筛选</button>}</div>
        <p>模块、关键词和题目类型可组合筛选。</p>
      </section>
      <details className="practical-progress-reset">
        <summary>
          <span><b>章节进度重置</b><small>按章节清除作答与草稿</small></span>
          <i aria-hidden="true">＋</i>
        </summary>
        <p className="practical-progress-reset-intro">清除该章节的作答、评分与草稿，收藏不受影响。</p>
        <div className="practical-progress-reset-list">
          {groupDetails.map((item) => <div className="practical-progress-reset-row" key={item.group}>
            <span><b>{item.group}</b><small>{item.category}</small></span>
            <button
              type="button"
              disabled={resettingGroup !== null}
              onClick={() => void resetGroupProgress(item.group, item.category, item.taskCodes, item.notebookTaskCodes)}
              aria-label={`重置 ${item.group} ${item.category} 进度`}
            >
              {resettingGroup === item.group ? "重置中…" : "重置"}
            </button>
          </div>)}
        </div>
        {resetMessage && <p className={`practical-progress-reset-message ${resetMessage.kind}`} role={resetMessage.kind === "error" ? "alert" : "status"}>{resetMessage.text}</p>}
      </details>
    </aside>

    <section className="catalog-results">
      <div className="result-bar"><span>共 <b>{filtered.length}</b> 道实操题{selectedModule ? ` · ${selectedModule.label} ${selectedModule.maxScore} 分` : ""}</span><span>每个考试模块抽 1 题，共 6 题 100 分</span></div>
      {visibleGroups.map((item) => {
        const groupTasks = filtered.filter((task) => task.group === item);
        const sample = groupTasks[0];
        return <section className="practical-group-section" key={item} aria-labelledby={`practical-group-${item.replaceAll(".", "-")}`}>
          <div className="practical-group-heading"><div><span className="question-number">章节 {item}</span><h2 id={`practical-group-${item.replaceAll(".", "-")}`}>{sample.category}</h2></div><p><b>占实操总分 {Math.round(sample.maxScore / examBlueprint.practical.maxScore * 100)}%</b> · {sample.unit} · {groupTasks.length} 道题</p></div>
          <div className="card-grid">{groupTasks.map((task) => {
            const href = task.hasNotebook ? `/practical/${task.code}/lab` : `/practical/${task.code}`;
            return <IntentLink className="task-card" href={href} key={task.code}><div className="task-card-head"><div className="question-meta-left"><span className="question-number">{task.code}</span><span className="chip">{task.category}</span>{task.hasNotebook && <span className="chip">Python 实验</span>}</div><span className="task-score-weight"><strong>{task.maxScore}</strong> 分</span></div><h3>{task.title}</h3><p>{task.descriptionExcerpt}</p><div className="task-card-facts"><span>{task.rubricCount} 个评分项</span><span>{task.materialSummary}</span><span>建议 {task.durationMinutes} 分钟</span></div><div className="task-card-foot"><b>{task.hasNotebook ? "进入实验室 →" : "查看题目 →"}</b></div></IntentLink>;
          })}</div>
        </section>;
      })}
      {!visibleGroups.length && <div className="empty-state">没有符合当前条件的实操题。</div>}
    </section>
  </div>;
}
