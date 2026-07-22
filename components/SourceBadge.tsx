import type { AnswerBasis, AnswerSource, PracticalAnswerBasis } from "@/lib/content";

export function SourceBadge({ source, basis }: { source: AnswerSource; basis?: AnswerBasis | PracticalAnswerBasis }) {
  const provenance = source === "official"
    ? { label: "答案来源：指导手册", detail: "答案取自《人工智能训练师（三级）评价指导手册》的官方模拟题或配套答案。" }
    : basis === "completed_reference_notebook"
      ? { label: "参考依据：配套完成版 Notebook", detail: "指导手册未提供本题标准答案；参考代码来自随官方题目素材提供的完成版 Notebook，并保留其执行输出。" }
    : basis === "official_dataset_analysis"
      ? { label: "参考依据：官方数据集实算", detail: "指导手册未提供本题标准答案；本站对题目配套的官方 Excel 数据集进行可复算统计，并以题干、评分表和文件哈希锁定结果。" }
    : basis === "official_template_completion"
      ? { label: "参考依据：官方模板填写示例", detail: "指导手册未提供本题标准答案；本站逐空读取题目配套的官方 Word 模板，根据题干和评分细则整理填写示例，并以题目与文件哈希锁定。" }
    : basis === "official_task_rubric_example"
      ? { label: "参考依据：题干与官方评分表", detail: "指导手册未为本题提供独立素材或标准答案；本站依据完整题干和官方评分表逐项整理作答示例，并以题干和评分表的内容指纹锁定。" }
    : basis === "official_rubric"
      ? { label: "参考依据：官方评分表整理", detail: "指导手册未提供本题标准答案；本站仅依据官方题目要求和官方评分细则整理作答示例。" }
    : basis === "third_party_reference"
      ? { label: "答案来源：公开参考题库", detail: "公开参考题库与本题的题型、序号、题干和选项严格匹配后采用；不属于指导手册官方答案。" }
      : basis === "editorial_review"
        ? { label: "答案来源：本站逐题复核", detail: "指导手册未提供本题答案；本站已对完整题干和选项逐题复核，并用内容哈希绑定复核记录。该答案不属于指导手册官方答案。" }
      : basis === "heuristic"
          ? { label: "答案来源：本站知识点整理", detail: "指导手册未提供本题答案，本站依据题干、知识点和通用规范整理，建议结合资料复核。" }
          : { label: "参考依据：官方评分表整理", detail: "指导手册未提供本题参考答案，本站依据题目要求和手册官方评分细则整理。" };
  return <span className={`source-badge ${source}`} title={provenance.detail} aria-label={provenance.detail}>{provenance.label}</span>;
}

export function PracticalSourceNote({ basis }: { basis: PracticalAnswerBasis }) {
  if (basis === "manual_official") return null;
  const copy = basis === "official_dataset_analysis"
    ? "本示例由题目配套的官方数据集实算生成，但不是指导手册提供的标准答案；题干、评分表或源文件变化时会停止应用。"
    : basis === "completed_reference_notebook"
      ? "参考代码来自题目素材中的配套完成版 Notebook；它可用于核对实现路径，但不等同于指导手册标准答案。"
      : basis === "official_template_completion"
        ? "本站逐空读取题目配套的官方 Word 模板，并按题干与评分细则整理填写示例；它不是指导手册标准答案，题目或模板变化时会停止应用。"
      : basis === "official_task_rubric_example"
        ? "官方资料未附本题的独立输入文件或标准答案；本站只按完整题干与官方评分表逐项整理示例，并用内容指纹防止题目变化后继续套用。"
      : "指导手册只提供题目和评分细则；本站按官方评分点整理作答示例，不把整理内容标作官方答案。";
  return <p className="practical-source-note"><b>参考依据：</b>{copy}</p>;
}
