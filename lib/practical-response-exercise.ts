import type { PracticalTask, RubricItem } from "./content.ts";

export type PracticalResponseSection = {
  id: "deliverable-1" | "deliverable-2";
  number: 1 | 2;
  title: string;
  outputLabel: string;
  prompt: string;
  referenceAnswer: string;
  rubric: RubricItem[];
};

export type PracticalResponseExercise = {
  sections: [PracticalResponseSection, PracticalResponseSection];
  storageVersion: string;
};

function splitAt(source: string, marker: string) {
  const index = source.indexOf(marker);
  if (index <= 0) return null;
  return [source.slice(0, index).trim(), source.slice(index).trim()] as const;
}

function splitPrompts(task: PracticalTask) {
  const first = task.description.indexOf("（1）");
  const second = task.description.indexOf("（2）", first + 3);
  if (first < 0 || second <= first) return null;
  return [task.description.slice(first, second).trim(), task.description.slice(second).trim()] as const;
}

function splitReference(task: PracticalTask) {
  const markers = task.group === "1.2"
    ? [`\n二、${task.code}-2`]
    : ["\n（2）", `\n二、${task.code}-2.docx`, `\n二、${task.code}-2`];
  for (const marker of markers) {
    const split = splitAt(task.referenceAnswer, marker);
    if (split) return split;
  }
  return null;
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
  const references = splitReference(task);
  const rubric = splitRubric(task);
  if (!prompts || !references || !rubric) return null;
  if ([...prompts, ...references].some((value) => !value.trim())) return null;

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
      referenceAnswer: references[index],
      rubric: [...rubric[index]],
    };
  }) as [PracticalResponseSection, PracticalResponseSection];

  return {
    sections,
    storageVersion: `${task.answerBasis}-${task.referenceAnswer.length}-${task.rubric.map((item) => `${item.id}:${item.points}`).join("-")}`,
  };
}
