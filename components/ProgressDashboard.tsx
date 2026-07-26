"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProgressData } from "@/lib/progress-data";

type FavoriteItem = ProgressData["favoriteItems"][number];

function shortDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export default function ProgressDashboard({ initialData }: { initialData: ProgressData }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");

  async function removeFavorite(item: FavoriteItem) {
    const previous = data;
    setData((current) => ({
      ...current,
      favoriteItems: current.favoriteItems.filter((value) => !(value.itemType === item.itemType && value.itemId === item.itemId)),
    }));
    const response = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId, active: false }) });
    if (!response.ok) {
      setData(previous);
      setError("取消收藏失败，请稍后重试");
    }
  }

  if (error) return <div className="notice" role="alert">{error}。</div>;

  return <div>
    <section className="progress-overview" aria-labelledby="theory-progress-heading">
      <div className="panel-heading"><div><p className="eyebrow">理论题库</p><h2 id="theory-progress-heading">题型进度</h2></div><Link className="text-link" href="/theory">继续练习 →</Link></div>
    <div className="progress-grid theory-progress-grid">
      {data.theoryTypeProgress.map((item) => <div className="progress-stat" key={item.type}>
        <strong>{item.answered}<small> / {item.total}</small></strong>
        <span>{item.label}进度</span>
        <div className="progress-stat-meter" aria-label={`${item.label}已完成 ${item.answered}/${item.total}`}><i style={{ width: `${item.total ? item.answered / item.total * 100 : 0}%` }} /></div>
      </div>)}
    </div>
    </section>

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
  </div>;
}
