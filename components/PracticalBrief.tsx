import type { PracticalTask } from "@/lib/content";

// Unified "题目要求" block for every practical task sidebar. Renders the task
// description plus the three official task-sheet sections (设备/技能/质量), so
// the same official information is available and laid out identically across
// all task types. Defaults to open on the detail routes; the notebook lab
// passes `open={false}` to keep the code area tall.
export function PracticalBrief({ task, open = true }: { task: PracticalTask; open?: boolean }) {
  const sheet = task.officialTaskSheet;
  return <details className="practical-brief" open={open}>
    <summary><span>题目要求</span><small>题干与官方任务单</small></summary>
    <div className="practical-brief-body">
      <div className="task-description">{task.description}</div>
      {sheet?.equipmentRequirements && <section className="practical-brief-sheet">
        <h4>场地设备要求</h4><p>{sheet.equipmentRequirements}</p>
      </section>}
      {sheet?.skillRequirements && <section className="practical-brief-sheet">
        <h4>技能要求</h4><p>{sheet.skillRequirements}</p>
      </section>}
      {sheet?.qualityIndicators && <section className="practical-brief-sheet">
        <h4>质量指标</h4><p>{sheet.qualityIndicators}</p>
      </section>}
    </div>
  </details>;
}
