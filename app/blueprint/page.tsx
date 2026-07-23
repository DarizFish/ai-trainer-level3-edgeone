import Link from "next/link";
import { examBlueprint } from "@/lib/exam-blueprint";

export const metadata = { title: "三级认定方案" };

export default function BlueprintPage() {
  return <main>
    <section className="page-hero paper-texture"><div className="container"><div className="breadcrumbs"><Link href="/">首页</Link>　/　认定方案</div><p className="eyebrow">官方考试结构</p><h1>人工智能训练师三级认定方案</h1><p>把题量、分值、用时和合格规则集中在一页，练习与模拟考试均按此方案组卷。</p></div></section>
    <section className="container workspace blueprint-page">
      <div className="blueprint-pass-rule"><div><span>理论合格线</span><strong>{examBlueprint.passingScore}</strong><small>/ {examBlueprint.theory.maxScore} 分</small></div><div><span>实操合格线</span><strong>{examBlueprint.passingScore}</strong><small>/ {examBlueprint.practical.maxScore} 分</small></div><p><b>两科分别判定。</b>理论和实操均达到 60 分才算合格；只有一科未合格时，可只补考该科，不计算两科综合平均分。</p></div>
      <section className="blueprint-section"><div className="panel-heading"><div><p className="eyebrow">理论知识</p><h2>闭卷机考 · {examBlueprint.theory.durationMinutes} 分钟</h2></div><span>{examBlueprint.theory.totalQuestions} 题 / {examBlueprint.theory.maxScore} 分</span></div><div className="blueprint-theory-grid">{Object.entries(examBlueprint.theory.types).map(([key, type]) => <article key={key}><span>{type.label}</span><strong>{type.count}</strong><p>{type.count} 题 × {type.points} 分 = {type.count * type.points} 分</p></article>)}</div><p className="notice">多选题必须与参考答案完全匹配才得分，不设部分分。</p></section>
      <section className="blueprint-section"><div className="panel-heading"><div><p className="eyebrow">操作技能</p><h2>计算机机考 · {examBlueprint.practical.durationMinutes} 分钟</h2></div><span>{examBlueprint.practical.totalTasks} 题 / {examBlueprint.practical.maxScore} 分</span></div><div className="blueprint-module-list">{examBlueprint.practical.modules.map((examSection, index) => <article key={examSection.key}><span>{index + 1}</span><div><h3>{examSection.label}</h3><p>{examSection.groups.length > 1 ? `${examSection.groups.join(" / ")} 二选一` : `${examSection.groups[0]} 模块抽取一题`}</p></div><b>{examSection.durationMinutes} 分钟</b><strong>{examSection.maxScore} 分</strong></article>)}</div></section>
      <section className="blueprint-actions"><div><p className="eyebrow">按方案训练</p><h2>先专项练习，再用完整考场校准节奏</h2></div><div className="hero-actions"><Link className="button button-primary" href="/theory/mock">理论模拟</Link><Link className="button button-quiet" href="/practical/mock">实操模拟</Link><Link className="button button-quiet" href="/resources">资料与报名</Link></div></section>
    </section>
  </main>;
}
