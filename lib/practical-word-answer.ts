import type { PracticalTask } from "./content";

/**
 * Word 交付物答案的结构化读取。
 *
 * 这里取代了原先 practical-reference.ts 的做法：把 Word 答案、评分点、Python 代码
 * 说明混在同一个 referenceAnswer 字符串里，再靠四种字符串匹配去切分（找
 * 「Word 交付物作答示例」、找「<题号>.docx」、找「（2）」、找「Python 参考代码：」）。
 * 任何一条官方口径的措辞变化都会让切分错位，而错位的表现是「答案面板少了一段」，
 * 不报错、不易察觉。
 *
 * 现在答案以结构存在 data/entities/practical/<题号>.json 的 wordAnswer 字段里，
 * 由 scripts/practical_word_answers.py 从官方参考快照写入。
 */

/** 分点作答：1.2、2.1、3.2 的小节。 */
export type WordAnswerSection = {
  heading: string;
  items?: string[];
  /** 2.2 的测试报告是成段的正文，不是条目。 */
  paragraphs?: string[];
  /**
   * 1.2 是一份 .docx 里答两问，这里标明本小节属于第几问。由
   * scripts/practical_word_answers.py 在构建期判定并校验，运行时不再切字符串。
   */
  part?: 1 | 2;
};

/** 3.1 的优化方案是「方向 + 解决方案」成对出现；3.2 的流程要点则是普通条目。 */
export type WordAnswerDirection = { direction: string; solution: string };
export type WordAnswerItem = string | WordAnswerDirection;

/** 4.1、4.2 的模板填空，order 即模板中空白的先后顺序。 */
export type WordAnswerFill = { order: number; label: string; answer: string };

/** 2.2.2/2.2.4 的回归指标是标量；2.2.1 的分类报告是每个类别一行。 */
export type WordAnswerScalarMetric = { name: string; value: number };
export type WordAnswerClassMetric = { class: string; precision: number; recall: number; f1Score: number; support: number };
export type WordAnswerMetric = WordAnswerScalarMetric | WordAnswerClassMetric;

export type WordAnswerComparison = { model: string; trainR2: number; testR2: number; mse: number };

export type WordAnswerDeliverable = {
  fileName: string;
  mode: string;
  sections?: WordAnswerSection[];
  items?: WordAnswerItem[];
  fills?: WordAnswerFill[];
  /** 2.2 的测试报告会标明所用模型与复算指标。 */
  model?: string;
  metrics?: WordAnswerMetric[];
  comparison?: WordAnswerComparison;
};

export type PracticalWordAnswer = {
  /** 溯源保留在数据里，界面不展示。 */
  source: string;
  deliverables: WordAnswerDeliverable[];
};

export function getPracticalWordAnswer(task: PracticalTask): PracticalWordAnswer | null {
  const answer = task.wordAnswer;
  if (!answer?.deliverables?.length) return null;
  return answer;
}

/** 渲染单元：所有形态最终都收敛成「一个标题 + 若干行」。 */
export type WordAnswerBlock = { heading: string; lines: string[]; part?: 1 | 2 };

/** 不带小节标题、直接给条目的交付物，标题按交付物类型补上。 */
const ITEMS_HEADING: Record<string, string> = {
  optimization_plan: "优化方向与解决方案",
  interaction_flow: "交互流程要点",
};

/**
 * 把一份交付物摊平成可直接渲染的段落序列。组件不需要认识五种形态，只渲染
 * 「标题 + 若干行」；形态差异在这里收敛。
 */
export function flattenDeliverable(deliverable: WordAnswerDeliverable): WordAnswerBlock[] {
  const blocks: WordAnswerBlock[] = [];

  if (deliverable.model || deliverable.metrics?.length) {
    const lines: string[] = [];
    if (deliverable.model) lines.push(`所用模型：${deliverable.model}`);
    for (const metric of deliverable.metrics ?? []) {
      lines.push("name" in metric
        ? `${metric.name}：${metric.value}`
        : `${metric.class}：precision ${metric.precision} · recall ${metric.recall} · F1 ${metric.f1Score} · 样本数 ${metric.support}`);
    }
    if (deliverable.comparison) {
      const { model, trainR2, testR2, mse } = deliverable.comparison;
      lines.push(`对照模型 ${model}：训练集 R² ${trainR2}，测试集 R² ${testR2}，MSE ${mse}`);
    }
    blocks.push({ heading: "测试结果", lines });
  }

  for (const section of deliverable.sections ?? []) {
    blocks.push({ heading: section.heading, lines: [...(section.items ?? []), ...(section.paragraphs ?? [])], part: section.part });
  }

  if (deliverable.items?.length) {
    blocks.push({
      heading: ITEMS_HEADING[deliverable.mode] ?? "作答要点",
      lines: deliverable.items.map(item => (typeof item === "string" ? item : `${item.direction}：${item.solution}`)),
    });
  }

  for (const fill of deliverable.fills ?? []) {
    blocks.push({ heading: `第 ${fill.order} 空 · ${fill.label}`, lines: [fill.answer] });
  }

  return blocks;
}

/** 一道题的全部交付物摊平后的渲染序列。 */
export function practicalWordAnswerBlocks(task: PracticalTask): WordAnswerBlock[] {
  return (getPracticalWordAnswer(task)?.deliverables ?? []).flatMap(flattenDeliverable);
}
