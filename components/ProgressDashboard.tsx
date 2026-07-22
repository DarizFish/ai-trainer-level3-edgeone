"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WrongItem = { id: string; index: number; typeLabel: string; category: string; stem: string; selectedAnswer: string[]; correctAnswer: string[]; attempts: number; updatedAt: string; href: string };
type FavoriteItem = { itemType: "theory" | "practical"; itemId: string; title: string; meta: string; href: string; updatedAt: string };
type RecentMock = { mode: string; score: number; maxScore: number; passed: boolean; createdAt: string };
type RecentPractical = { taskCode: string; title: string; score: number; maxScore: number; createdAt: string; href: string };
type PracticalAbility = { key: string; label: string; bestScore: number; maxScore: number; attempts: number };
type Progress = {
  answered: number;
  wrong: number;
  favorites: number;
  practicalAttempts: number;
  mockAttempts: number;
  bestTheoryScore: number;
  practicalAbility: PracticalAbility[];
  estimatedPracticalScore: number;
  drafts: number;
  wrongItems: WrongItem[];
  favoriteItems: FavoriteItem[];
  recentMocks: RecentMock[];
  recentPractical: RecentPractical[];
};

function shortDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export default function ProgressDashboard() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/progress").then(async (response) => {
      if (!response.ok) throw new Error("学习档案暂时无法读取");
      return await response.json() as Progress;
    }).then(setData).catch((reason: Error) => setError(reason.message));
  }, []);

  async function removeFavorite(item: FavoriteItem) {
    const response = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId, active: false }) });
    if (!response.ok) return setError("取消收藏失败，请稍后重试");
    setData((current) => current ? { ...current, favorites: Math.max(0, current.favorites - 1), favoriteItems: current.favoriteItems.filter((value) => !(value.itemType === item.itemType && value.itemId === item.itemId)) } : current);
  }

  if (error) return <div className="notice" role="alert">{error}。</div>;
  if (!data) return <div className="empty-state">正在汇总学习档案…</div>;

  const theoryPassed = data.bestTheoryScore >= 60;
  const practicalPassed = data.estimatedPracticalScore >= 60;
  const nextTitle = !theoryPassed && practicalPassed ? "优先补强理论科目" : theoryPassed && !practicalPassed ? "优先补强实操科目" : !theoryPassed && !practicalPassed ? "先建立两科稳定得分" : "两科已达到模拟合格线";
  const nextCopy = !theoryPassed && practicalPassed ? "实操能力估算已过线，建议集中做理论错题和完整模拟卷。" : theoryPassed && !practicalPassed ? "理论最高分已过线，建议按官方权重补齐实操薄弱模块。" : !theoryPassed && !practicalPassed ? "理论与实操分别达到 60 分才合格，先从下方低分模块开始。" : "继续用完整模拟维持速度和稳定性；两科仍需分别参加正式认定。";

  return <div>
    <div className="progress-grid">
      <div className="progress-stat"><strong>{data.answered}</strong><span>已练理论题 / 900</span></div>
      <a className="progress-stat" href="#wrong-list"><strong>{data.wrong}</strong><span>待订正错题</span></a>
      <div className={`progress-stat subject-status ${theoryPassed ? "passed" : "pending"}`}><strong>{data.bestTheoryScore}</strong><span>理论最高分 · {theoryPassed ? "已达 60" : "未达 60"}</span></div>
      <div className={`progress-stat subject-status ${practicalPassed ? "passed" : "pending"}`}><strong>{Math.round(data.estimatedPracticalScore * 10) / 10}</strong><span>实操能力估算 · {practicalPassed ? "已达 60" : "未达 60"}</span></div>
    </div>

    <section className="progress-next">
      <div><p className="eyebrow">两科分别判定</p><h2>{nextTitle}</h2><p>{nextCopy}</p></div>
      <div className="hero-actions"><Link className="button button-primary" href={theoryPassed && !practicalPassed ? "/practical/mock" : "/theory"}>{theoryPassed && !practicalPassed ? "开始实操训练" : "继续理论练习"}</Link><Link className="button button-quiet" href="/blueprint">查看认定方案</Link></div>
    </section>

    <section className="progress-panel ability-panel"><div className="panel-heading"><div><p className="eyebrow">实操官方权重</p><h2>六模块能力分布</h2><p>按各模块最好一次逐项自评分折算，合计仅用于训练诊断。</p></div><span>{Math.round(data.estimatedPracticalScore * 10) / 10} / 100</span></div><div className="ability-grid">{data.practicalAbility.map((ability) => <article key={ability.key}><div><b>{ability.label}</b><span>{ability.bestScore} / {ability.maxScore}</span></div><div className="ability-track"><span style={{ width: `${ability.maxScore ? (ability.bestScore / ability.maxScore) * 100 : 0}%` }} /></div><small>{ability.attempts ? `已评分 ${ability.attempts} 次` : "尚未评分"} · 权重 {ability.maxScore}</small></article>)}</div></section>

    <div className="progress-detail-grid">
      <section className="progress-panel" id="wrong-list">
        <div className="panel-heading"><div><p className="eyebrow">订正队列</p><h2>待订正错题</h2></div><span>{data.wrongItems.length} 题</span></div>
        <div className="progress-list">
          {data.wrongItems.map((item) => <article key={item.id}>
            <div><span className="question-number">#{String(item.index).padStart(3, "0")}</span><span className="chip">{item.typeLabel}</span><span className="chip">{item.category}</span></div>
            <h3>{item.stem}</h3>
            <p>上次选择：{item.selectedAnswer.join("、")} · 已作答 {item.attempts} 次 · {shortDate(item.updatedAt)}</p>
            <Link className="text-link" href={item.href}>打开并订正 →</Link>
          </article>)}
          {!data.wrongItems.length && <div className="empty-state compact">当前没有待订正错题，继续保持。</div>}
        </div>
      </section>

      <section className="progress-panel" id="favorite-list">
        <div className="panel-heading"><div><p className="eyebrow">稍后复习</p><h2>我的收藏</h2></div><span>{data.favoriteItems.length} 项</span></div>
        <div className="progress-list">
          {data.favoriteItems.map((item) => <article key={`${item.itemType}-${item.itemId}`}>
            <p>{item.meta} · {shortDate(item.updatedAt)}</p><h3>{item.title}</h3>
            <div className="inline-actions"><Link className="text-link" href={item.href}>打开内容 →</Link><button type="button" onClick={() => void removeFavorite(item)}>取消收藏</button></div>
          </article>)}
          {!data.favoriteItems.length && <div className="empty-state compact">还没有收藏内容，可以在题库中点击“收藏”。</div>}
        </div>
      </section>
    </div>

    <section className="progress-panel progress-history">
      <div className="panel-heading"><div><p className="eyebrow">最近记录</p><h2>考试与实操</h2></div><span>代码草稿 {data.drafts} 份</span></div>
      <div className="history-grid">
        <div><h3>理论模拟</h3>{data.recentMocks.map((item, index) => <p key={`${item.createdAt}-${index}`}><b>{item.score} / {item.maxScore}</b><span>{item.mode === "official" ? "官方卷" : "随机卷"} · {shortDate(item.createdAt)}</span></p>)}{!data.recentMocks.length && <p className="small-copy">暂无模拟考试记录</p>}</div>
        <div><h3>实操评分</h3>{data.recentPractical.map((item, index) => <p key={`${item.createdAt}-${index}`}><Link href={item.href}><b>{item.taskCode} · {item.score} / {item.maxScore}</b><span>{item.title} · {shortDate(item.createdAt)}</span></Link></p>)}{!data.recentPractical.length && <p className="small-copy">暂无实操评分记录</p>}</div>
      </div>
    </section>
  </div>;
}
