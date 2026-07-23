import { content } from "@/lib/content";
import PracticalCatalog from "@/components/PracticalCatalog";

export const metadata = { title: "实操题库" };
export const dynamic = "force-static";

export default function PracticalPage() {
  const tasks = content.practical.map((task) => ({
    answerBasis: task.answerBasis,
    answerSource: task.answerSource,
    category: task.category,
    code: task.code,
    description: task.description,
    durationMinutes: task.durationMinutes,
    group: task.group,
    hasNotebook: task.hasNotebook,
    materials: task.materials.map(({ label }) => ({ label })),
    maxScore: task.maxScore,
    rubric: task.rubric.map(({ id }) => ({ id })),
    title: task.title,
    unit: task.unit,
  }));
  return <main className="practical-page">
    <section className="container practical-workspace"><PracticalCatalog tasks={tasks} /></section>
  </main>;
}
