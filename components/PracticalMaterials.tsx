import type { PracticalMaterial } from "@/lib/content";

const MATERIAL_ICONS: Record<PracticalMaterial["kind"], string> = {
  spreadsheet: "XLSX",
  dataset: "CSV",
  document: "DOC",
  notebook: "IPYNB",
  model: "ONNX",
  image: "IMG",
  text: "TXT",
  code: "PY",
  other: "FILE",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function actionLabel(material: PracticalMaterial) {
  if (material.kind === "notebook") return "下载模板";
  if (["spreadsheet", "dataset", "document"].includes(material.kind)) return "下载材料";
  return "打开文件";
}

function shouldDownload(material: PracticalMaterial) {
  return ["spreadsheet", "dataset", "document", "notebook", "code", "text"].includes(material.kind);
}

export function PracticalMaterials({ materials, compact = false, showDocumentPreview = true }: { materials: PracticalMaterial[]; compact?: boolean; showDocumentPreview?: boolean }) {
  return <section className={`official-materials ${compact ? "compact" : ""}`}>
    <header><div><p className="eyebrow">OFFICIAL MATERIALS</p><h2>本题官方文件</h2></div><span>{materials.length ? `已核对 · ${materials.length} 份` : "已核对 · 0 份"}</span></header>
    {materials.length ? <div className="official-material-list">{materials.map((material) => <div className="official-material-entry" key={`${material.kind}-${material.name}`}>
      <article>
        <span className={`material-icon ${material.kind}`}>{MATERIAL_ICONS[material.kind]}</span>
        <div><b>{material.name}</b><small>官方原始文件 · {material.label} · {formatBytes(material.size)}</small><p>{material.note}</p></div>
        {material.url ? <a href={material.url} target={shouldDownload(material) ? undefined : "_blank"} rel="noreferrer" download={shouldDownload(material) ? "" : undefined}>{actionLabel(material)} →</a> : <span className="material-local">实验室按需加载</span>}
      </article>
      {showDocumentPreview && material.preview?.length ? <details className="document-inline-preview" open>
        <summary><span><b>官方 Word 原文</b><small>网页内直接阅读 · 保留原文件下载</small></span><span aria-hidden="true">⌄</span></summary>
        <div className="document-preview-page" role="document" aria-label={`${material.name} 原文预览`}>
          {material.preview.map((block, index) => <p className={`document-preview-${block.kind}`} key={`${index}-${block.text}`}>{block.text}</p>)}
        </div>
      </details> : null}
    </div>)}</div> : <p className="official-material-empty"><b>官方素材目录未附独立输入文件。</b><span>本题直接按题目要求完成作答；需要生成的 docx、截图或报告属于考生输出，不是缺失素材。</span></p>}
  </section>;
}
