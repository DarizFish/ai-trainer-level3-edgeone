"use client";

import { useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { getPracticalWordDeliverable } from "@/lib/practical-word-deliverable";
import { PracticalTaskHeader } from "./PracticalTaskHeader";
import { PracticalBrief } from "./PracticalBrief";
import { PracticalMaterialsList } from "./PracticalMaterialsList";
import JupyterLiteLab from "./JupyterLiteLab";

type Surface = "notebook" | "document";

export default function PracticalLabWorkbench({ task, signedIn, userEmail }: { task: PracticalTask; signedIn: boolean; userEmail: string | null }) {
  const [activeSurface, setActiveSurface] = useState<Surface>("notebook");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const wordDeliverable = useMemo(() => getPracticalWordDeliverable(task), [task]);

  return <div className={`container lab-study-layout ${railCollapsed ? "rail-collapsed" : ""}`}>
    {railCollapsed
      ? <button type="button" className="lab-rail-expand" aria-expanded={false} aria-controls="lab-task-sidebar" aria-label={`展开题目侧栏（${task.code}）`} onClick={() => setRailCollapsed(false)}>
          <span className="lab-rail-expand-icon" aria-hidden="true">»</span>
          <span className="lab-rail-expand-code" aria-hidden="true">{task.code}</span>
          <span className="lab-rail-expand-label" aria-hidden="true">题目</span>
        </button>
      : <aside id="lab-task-sidebar" className="lab-task-sidebar" aria-label="本题信息与作答工作区">
      <button type="button" className="lab-rail-collapse" aria-expanded aria-controls="lab-task-sidebar" aria-label="收起题目侧栏" title="收起题目侧栏" onClick={() => setRailCollapsed(true)}><span aria-hidden="true">‹</span></button>
      <PracticalTaskHeader task={task} variant="rail" />
      <section className="lab-workspace-switcher" role="tablist" aria-label="作答工作区">
        <p className="eyebrow">作答工作区</p>
        <button type="button" role="tab" aria-selected={activeSurface === "notebook"} aria-controls={`lab-work-${task.code}`} onClick={() => setActiveSurface("notebook")}><span>Notebook</span><small>编写与运行代码</small></button>
        {wordDeliverable && <button type="button" role="tab" aria-selected={activeSurface === "document"} aria-controls={`lab-${wordDeliverable.id}`} onClick={() => setActiveSurface("document")}><span>{wordDeliverable.fileName}</span><small>撰写测试报告</small></button>}
      </section>
      {wordDeliverable && <p className="lab-rail-note">代码、结果和导出文件在 Notebook 中完成；需要撰写的测试报告，选择上方「{wordDeliverable.fileName}」。</p>}
      <PracticalBrief task={task} open={false} />
      <PracticalMaterialsList task={task} />
    </aside>}
    <section className="lab-primary-column">
      <JupyterLiteLab task={task} signedIn={signedIn} userEmail={userEmail} activeSurface={activeSurface} />
    </section>
  </div>;
}
