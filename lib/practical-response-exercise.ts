import type { PracticalTask, RubricItem } from "./content.ts";
import { flattenDeliverable, getPracticalWordAnswer, type WordAnswerBlock } from "./practical-word-answer.ts";

export type PracticalResponseSection = {
  id: "deliverable-1" | "deliverable-2";
  number: 1 | 2;
  title: string;
  outputLabel: string;
  prompt: string;
  reference: WordAnswerBlock[];
  rubric: RubricItem[];
};

export type PracticalResponseExercise = {
  sections: [PracticalResponseSection, PracticalResponseSection];
};

function splitPrompts(task: PracticalTask) {
  const first = task.description.indexOf("（1）");
  const second = task.description.indexOf("（2）", first + 3);
  if (first < 0 || second <= first) return null;
  return [task.description.slice(first, second).trim(), task.description.slice(second).trim()] as const;
}

/**
 * 两问的参考答案。此前是在 referenceAnswer 里找 `\n二、<题号>-2`、`\n（2）` 之类的
 * 标记现切——官方口径换个措辞切分就错位，而错位表现为「第二问的参考答案不见了」，
 * 不报错。现在直接读实体层的结构化答案：
 *
 *   3.1 天然是两份 .docx，一份一问；
 *   1.2 是一份 .docx 答两问，归属写在每个小节的 part 上，构建期已判定并校验。
 */
function structuredReference(task: PracticalTask) {
  const answer = getPracticalWordAnswer(task);
  if (!answer) return null;

  if (answer.deliverables.length >= 2) {
    return [flattenDeliverable(answer.deliverables[0]), flattenDeliverable(answer.deliverables[1])] as const;
  }
  const blocks = flattenDeliverable(answer.deliverables[0]);
  const first = blocks.filter((block) => block.part === 1);
  const second = blocks.filter((block) => block.part === 2);
  if (!first.length || !second.length) return null;
  return [first, second] as const;
}

function splitRubric(task: PracticalTask) {
  if (task.group === "3.1") {
    if (task.rubric.length < 2) return null;
    return [task.rubric.slice(0, -1), task.rubric.slice(-1)] as const;
  }
  const first = task.rubric.filter((item) => item.description.includes(`${task.code}-1`));
  const second = task.rubric.filter((item) => item.description.includes(`${task.code}-2`));
  if (!first.length || !second.length || first.length + second.length !== task.rubric.length) return null;
  return [first, second] as const;
}

function outputLabel(task: PracticalTask, prompt: string, number: 1 | 2) {
  const expectedFile = `${task.code}-${number}.docx`;
  if (prompt.toLowerCase().includes(expectedFile.toLowerCase())) return expectedFile;
  return `${task.code}.docx · 题号 ${task.code}-${number}`;
}

export function createPracticalResponseExercise(task: PracticalTask): PracticalResponseExercise | null {
  if (task.hasNotebook || !["1.2", "3.1"].includes(task.group)) return null;
  const prompts = splitPrompts(task);
  const references = structuredReference(task);
  const rubric = splitRubric(task);
  if (!prompts || !references || !rubric) return null;
  if (prompts.some((value) => !value.trim())) return null;

  const titles = task.group === "3.1"
    ? ["数据分析报告", "优化方向与解决方案"]
    : ["问题与影响分析", "优化方案与预期效果"];
  const sections = ([0, 1] as const).map((index) => {
    const number = (index + 1) as 1 | 2;
    return {
      id: `deliverable-${number}` as const,
      number,
      title: titles[index],
      outputLabel: outputLabel(task, prompts[index], number),
      prompt: prompts[index],
      reference: references[index],
      rubric: [...rubric[index]],
    };
  }) as [PracticalResponseSection, PracticalResponseSection];

  return { sections };
}
