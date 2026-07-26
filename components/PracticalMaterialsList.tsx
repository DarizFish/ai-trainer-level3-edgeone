import type { PracticalMaterial, PracticalTask } from "@/lib/content";

const KIND_LABEL: Record<PracticalMaterial["kind"], string> = {
  spreadsheet: "表格", dataset: "数据集", document: "文档", notebook: "Notebook",
  model: "模型", image: "图片", text: "文本", code: "代码", other: "文件",
};

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Unified "本题文件" list for every practical task sidebar. Lists all materials
// (including notebooks loaded inside the lab iframe, which show a "实验区加载"
// note instead of a download link) so the material inventory is presented the
// same way across task types.
export function PracticalMaterialsList({ task }: { task: PracticalTask }) {
  if (task.materials.length === 0) return null;
  return <section className="practical-materials-list" aria-label="本题文件">
    <p className="eyebrow">本题文件</p>
    {task.materials.map((material) => <article key={`${material.kind}-${material.name}`}>
      <span className="pml-kind">{KIND_LABEL[material.kind]}</span>
      <div className="pml-meta"><b>{material.name}</b>{material.size ? <small>{formatSize(material.size)}</small> : null}</div>
      {material.url ? <a href={material.url} download>下载</a> : <em>实验区加载</em>}
    </article>)}
  </section>;
}
