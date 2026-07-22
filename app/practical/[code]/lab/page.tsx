import Link from "next/link";
import { notFound } from "next/navigation";
import { practicalByCode } from "@/lib/content";
import { getAccountUser } from "@/lib/account-auth";
import PracticalLabWorkbench from "@/components/PracticalLabWorkbench";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const task = practicalByCode.get(code);
  return { title: task ? `${task.code} JupyterLite 实验室` : "JupyterLite 实验室" };
}

export default async function LabPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const task = practicalByCode.get(code);
  if (!task?.hasNotebook) notFound();
  const user = await getAccountUser();

  return <main className="lab-page">
    <section className="lab-context-bar">
      <div className="lab-context-copy"><div className="breadcrumbs"><Link href="/">首页</Link>　/　<Link href="/practical">实操题库</Link>　/　{task.code}</div><div><span className="question-number">{task.code}</span><h1>{task.title}</h1></div></div>
      <div className="lab-context-meta"><span className="chip">{task.category}</span><span className="chip">{task.maxScore} 分 · 占总分 {task.maxScore}%</span><span className="chip">建议 {task.durationMinutes} 分钟</span><Link href="/practical">返回题库</Link></div>
    </section>
    <PracticalLabWorkbench task={task} signedIn={Boolean(user)} userEmail={user?.email ?? null} />
  </main>;
}
