import Link from "next/link";
import type { PracticalTask } from "@/lib/content";
import { getPracticalNeighbors, practicalTaskHref } from "@/lib/content";

// Compact previous/next/index pills, shared by both variants.
function TaskNav({ task }: { task: PracticalTask }) {
  const { prev, next } = getPracticalNeighbors(task.code);
  return <nav className="practical-task-nav" aria-label="题目切换">
    {prev
      ? <Link className="ptn-btn ptn-prev" href={practicalTaskHref(prev)} aria-label={`上一题 ${prev.code}`} title={`上一题 ${prev.code} ${prev.title}`}>‹<small>{prev.code}</small></Link>
      : <span className="ptn-btn ptn-prev is-disabled" aria-disabled="true">‹</span>}
    <Link className="ptn-btn ptn-index" href="/practical" title="返回实操题库">题库</Link>
    {next
      ? <Link className="ptn-btn ptn-next" href={practicalTaskHref(next)} aria-label={`下一题 ${next.code}`} title={`下一题 ${next.code} ${next.title}`}><small>{next.code}</small>›</Link>
      : <span className="ptn-btn ptn-next is-disabled" aria-disabled="true">›</span>}
  </nav>;
}

// Shared header for every practical task type.
// - variant="page": a slim single-row bar on the detail route (breadcrumb +
//   code + title on the left, compact nav pills on the right). Task meta lives
//   in each type's own sidebar, so it is not repeated here.
// - variant="rail": the stacked block embedded in the notebook lab sidebar,
//   which has no separate task sidebar, so it keeps the full meta chips.
export function PracticalTaskHeader({ task, variant }: { task: PracticalTask; variant: "page" | "rail" }) {
  if (variant === "page") {
    return <div className="practical-task-header is-page">
      <div className="pth-lead">
        <div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link></div>
        <div className="pth-title"><span className="question-number">{task.code}</span><h1>{task.title}</h1></div>
      </div>
      <TaskNav task={task} />
    </div>;
  }
  return <div className="practical-task-header is-rail">
    <div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link>　/　{task.code}</div>
    <span className="question-number">{task.code}</span>
    <h1>{task.title}</h1>
    <div className="practical-task-meta">
      <span className="chip">{task.category}</span>
      <span className="chip">{task.maxScore} 分 · 占总分 {task.maxScore}%</span>
      <span className="chip">建议 {task.durationMinutes} 分钟</span>
    </div>
    <TaskNav task={task} />
  </div>;
}
