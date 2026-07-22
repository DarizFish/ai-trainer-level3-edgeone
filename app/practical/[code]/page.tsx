import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { practicalByCode } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import PracticalWorkspace from "@/components/PracticalWorkspace";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params; const task = practicalByCode.get(code); return { title: task ? `${task.code} ${task.title}` : "实操题" };
}

export default async function PracticalDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params; const task = practicalByCode.get(code); if (!task) notFound();
  if (task.hasNotebook) redirect(`/practical/${task.code}/lab`);
  const user = await getAccountUser();
  const wordTemplateTask = task.group === "4.1" || task.group === "4.2";
  const businessAnswerSheetTask = task.group === "1.2";
  const answerSheetTask = wordTemplateTask || businessAnswerSheetTask;
  return <main className={`practical-detail-page ${wordTemplateTask ? "word-template-detail-page" : ""} ${businessAnswerSheetTask ? "business-answer-sheet-page" : ""}`}><section className="container practical-detail-head"><div><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link>　/　{task.code}</div><p className="eyebrow">{task.category} · {task.unit}</p><h1>{task.title}</h1><p>{task.maxScore} 分 · 建议用时 {task.durationMinutes} 分钟 · {wordTemplateTask ? "5 处 Word 模板空白" : businessAnswerSheetTask ? "两道大题答题卷" : `${task.rubric.length} 项官方完成标准`}</p></div><nav aria-label="本题快捷入口"><Link href="/practical">返回题库</Link>{!answerSheetTask && <Link href="/practical/mock">实操模拟</Link>}</nav></section><section className="container workspace practical-detail-workspace"><PracticalWorkspace task={task} userEmail={user?.email ?? null} /></section></main>;
}
