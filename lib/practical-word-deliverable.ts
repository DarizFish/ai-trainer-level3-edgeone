import type { PracticalTask } from "./content";

export type PracticalWordDeliverable = {
  id: string;
  fileName: string;
  title: string;
  placeholder: string;
  requirement: string;
};

const COPY: Record<string, Pick<PracticalWordDeliverable, "title" | "placeholder">> = {
  "2.1": {
    title: "数据清洗与标注规范",
    placeholder: "在此起草数据清洗与标注规范，完成后写入答题卷 Word 文档…",
  },
  "2.2": {
    title: "模型测试报告",
    placeholder: "在此起草模型测试报告，记录测试结果、问题分析与改进建议…",
  },
  "3.2": {
    title: "人机交互流程说明",
    placeholder: "在此起草人机交互流程与说明，完成后写入答题卷 Word 文档…",
  },
};

function requirementFor(task: PracticalTask, fileName: string) {
  const lines = task.description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.toLowerCase().includes(fileName.toLowerCase()))
    ?? `请将本题文字作答写入 ${fileName}。`;
}

/**
 * Only these three Notebook modules explicitly require a separate Word answer
 * sheet. Images, HTML exports, model files, and generated datasets remain
 * normal Notebook outputs and intentionally do not create extra web forms.
 */
export function getPracticalWordDeliverable(task: PracticalTask): PracticalWordDeliverable | null {
  const copy = COPY[task.group];
  if (!task.hasNotebook || !copy) return null;
  const fileName = `${task.code}.docx`;
  if (!task.description.toLowerCase().includes(fileName.toLowerCase())) return null;
  return {
    id: `word-${task.code}`,
    fileName,
    title: copy.title,
    placeholder: copy.placeholder,
    requirement: requirementFor(task, fileName),
  };
}
