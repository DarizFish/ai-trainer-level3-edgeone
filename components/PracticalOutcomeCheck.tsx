"use client";

import type { RubricItem } from "@/lib/content";
import type { PracticalRubricScores } from "@/lib/scoring";

function hasScore(scores: PracticalRubricScores, id: string) {
  return Object.prototype.hasOwnProperty.call(scores, id);
}

export function PracticalOutcomeCheck({ items, scores, onChange, title = "核对本题成果", eyebrow = "学习复盘", description = "先核对本项要求，再按实际成果给分；0 分和满分之间可记录部分完成。" }: {
  items: RubricItem[];
  scores: PracticalRubricScores;
  onChange: (id: string, score: number) => void;
  title?: string;
  eyebrow?: string;
  description?: string;
}) {
  const assessed = items.filter((item) => hasScore(scores, item.id)).length;
  const score = items.reduce((sum, item) => sum + (scores[item.id] ?? 0), 0);
  const maxScore = items.reduce((sum, item) => sum + item.points, 0);

  function markRemainingZero() {
    for (const item of items) if (!hasScore(scores, item.id)) onChange(item.id, 0);
  }

  return <section className="outcome-check" aria-label={title}>
    <header>
      <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><p>{description}</p></div>
      <div className="outcome-check-total"><strong>{score}</strong><span>/ {maxScore} 分</span><small>已核对 {assessed} / {items.length} 项</small></div>
    </header>
    <div className="outcome-check-list">
      {items.map((item) => {
        const selected = scores[item.id];
        const options = Array.from({ length: item.points + 1 }, (_, index) => index);
        return <article className={hasScore(scores, item.id) ? selected === item.points ? "complete" : selected === 0 ? "missed" : "partial" : "pending"} key={item.id}>
          <div className="outcome-condition"><span>{item.id}</span><p>{item.description}</p><strong>{item.points} 分</strong></div>
          <div className="outcome-score-row"><span>本项给分</span><div className="outcome-score-options" role="group" aria-label={`${item.id} 得分，满分 ${item.points} 分`}>
            {options.map((value) => <button type="button" key={value} className={selected === value ? "active" : ""} aria-pressed={selected === value} title={value === 0 ? "未达到" : value === item.points ? "完全达到" : "部分达到"} onClick={() => onChange(item.id, value)}>{value}<small>分</small></button>)}
          </div></div>
        </article>;
      })}
    </div>
    <footer><span>{assessed === items.length ? "✓ 本组成果已核对" : `还有 ${items.length - assessed} 项未核对`}</span><button type="button" disabled={assessed === items.length} onClick={markRemainingZero}>未核对项明确记 0 分</button></footer>
  </section>;
}
