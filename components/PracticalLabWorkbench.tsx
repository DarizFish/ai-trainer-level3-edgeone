"use client";

import { useMemo, useState } from "react";
import type { PracticalTask } from "@/lib/content";
import { getPracticalWordDeliverable } from "@/lib/practical-word-deliverable";
import JupyterLiteLab from "./JupyterLiteLab";

type Surface = "notebook" | "document";

export default function PracticalLabWorkbench({ task, signedIn, userEmail }: { task: PracticalTask; signedIn: boolean; userEmail: string | null }) {
  const [activeSurface, setActiveSurface] = useState<Surface>("notebook");
  const wordDeliverable = useMemo(() => getPracticalWordDeliverable(task), [task]);
  const sourceMaterials = task.materials.filter((material) => material.kind !== "notebook");

  return <div className="container lab-study-layout">
    <aside className="lab-task-sidebar" aria-label="本题官方资料与作答工作区">
      <header><p className="eyebrow">本题工作台</p><h2>{task.code}</h2><p>从这里切换交付物；右侧始终只显示当前的作答区域。</p></header>
      <section className="lab-workspace-switcher" role="tablist" aria-label="作答工作区">
        <p className="eyebrow">作答工作区</p>
        <button type="button" role="tab" aria-selected={activeSurface === "notebook"} aria-controls={`lab-work-${task.code}`} onClick={() => setActiveSurface("notebook")}><span>Notebook</span><small>编写与运行代码</small></button>
        {wordDeliverable && <button type="button" role="tab" aria-selected={activeSurface === "document"} aria-controls={`lab-${wordDeliverable.id}`} onClick={() => setActiveSurface("document")}><span>{wordDeliverable.fileName}</span><small>撰写测试报告</small></button>}
      </section>
      <details id="lab-brief" className="lab-rail-brief" open>
        <summary><span>题目要求</span><small>可收起</small></summary>
        <div className="task-description">{task.description}</div>
      </details>
      <section className="lab-rail-materials" aria-label="本题官方素材">
        <p className="eyebrow">本题文件</p>
        {sourceMaterials.map((material) => <article key={`${material.kind}-${material.name}`}>
          <span>{material.kind.toUpperCase()}</span><div><b>{material.name}</b><small>{material.label}</small></div>
          {material.url ? <a href={material.url} download>下载</a> : <em>实验区加载</em>}
        </article>)}
      </section>
      {wordDeliverable && <p className="lab-rail-note">代码、结果和导出文件在 Notebook 中完成；需要撰写的测试报告，选择上方的「{wordDeliverable.fileName}」。</p>}
    </aside>
    <section className="lab-primary-column">
      <JupyterLiteLab task={task} signedIn={signedIn} userEmail={userEmail} activeSurface={activeSurface} />
    </section>
  </div>;
}
