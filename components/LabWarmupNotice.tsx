"use client";

export type WarmupStage = "shell" | "kernel" | "packages" | "runtime" | "ready";

const ORDER: WarmupStage[] = ["shell", "kernel", "packages", "runtime"];

const LABELS: Record<WarmupStage, string> = {
  shell: "加载界面",
  kernel: "启动 Python 内核",
  packages: "下载依赖与素材",
  runtime: "下载 ONNX 模型",
  ready: "环境已就绪",
};

function stageState(stage: WarmupStage, current: WarmupStage): "done" | "active" | "waiting" {
  if (current === "ready") return "done";
  const at = ORDER.indexOf(current);
  const mine = ORDER.indexOf(stage);
  if (mine < at) return "done";
  return mine === at ? "active" : "waiting";
}

export default function LabWarmupNotice({ stage, hasModel }: { stage: WarmupStage; hasModel: boolean }) {
  return (
    <aside className="lab-warmup" role="status" aria-live="polite">
      <b>首次加载环境，请耐心等待</b>
      <ol>
        {ORDER.filter(item => item !== "runtime" || hasModel).map(item => (
          <li key={item} className={`is-${stageState(item, stage)}`}>
            <span className="lab-warmup-dot" aria-hidden="true" />
            {LABELS[item]}
          </li>
        ))}
      </ol>
    </aside>
  );
}
