import type { PracticalMaterial, PracticalTask } from "./content.ts";

const UNDERLINE_BLANK = /_{5,}/;

export type WordExerciseField = {
  id: string;
  blockIndex: number;
  label: string;
  before: string;
  after: string;
  referenceAnswer: string;
};

export type PracticalWordExercise = {
  materialName: string;
  materialSha256: string;
  blocks: NonNullable<PracticalMaterial["preview"]>;
  fields: WordExerciseField[];
};

function previousHeading(blocks: NonNullable<PracticalMaterial["preview"]>, blockIndex: number) {
  for (let index = blockIndex - 1; index >= 0; index -= 1) {
    if (blocks[index].kind === "heading") return blocks[index].text;
  }
  return "官方模板";
}

function referenceEntries(task: PracticalTask) {
  const lines = task.referenceAnswer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: Array<{ label: string; answer: string }> = [];
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("填写：")) continue;
    entries.push({
      label: (lines[index - 1] ?? "").replace(/^\d+\.\s*/, "").replace(/｜学习目标$/, ""),
      answer: line.slice("填写：".length).trim(),
    });
  }
  return entries;
}

function extractOfficialFill(task: PracticalTask, before: string, after: string) {
  const lines = task.referenceAnswer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = lines.find((line) => line.startsWith(before) && line.endsWith(after) && line.length > before.length + after.length);
  if (!match) return "";
  return match.slice(before.length, after ? -after.length : undefined).trim();
}

function blankLabel(blocks: NonNullable<PracticalMaterial["preview"]>, blockIndex: number, before: string, fieldNumber: number) {
  const topic = before.split(/[：:]/, 1)[0].trim();
  if (topic && topic.length <= 24) return topic;
  return `${previousHeading(blocks, blockIndex)} · 空白 ${fieldNumber}`;
}

export function createPracticalWordExercise(task: PracticalTask): PracticalWordExercise | null {
  if (task.group !== "4.1" && task.group !== "4.2") return null;
  if (task.rubric.length !== 1 || task.rubric[0].id !== "M1" || task.rubric[0].points !== 5) return null;
  const material = task.materials.find((candidate) => candidate.kind === "document" && candidate.preview?.length);
  if (!material?.preview) return null;

  const blocks = material.preview;
  const preparedReferences = referenceEntries(task);
  const fields: WordExerciseField[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const isTrainingBlank = task.group === "4.1" && block.text === "学习目标：";
    const underline = task.group === "4.2" ? UNDERLINE_BLANK.exec(block.text) : null;
    if (!isTrainingBlank && !underline) continue;

    const before = isTrainingBlank ? block.text : block.text.slice(0, underline!.index);
    const after = isTrainingBlank ? "" : block.text.slice(underline!.index + underline![0].length);
    const fieldNumber = fields.length + 1;
    const preparedReference = preparedReferences[fieldNumber - 1];
    const referenceAnswer = preparedReference?.answer ?? extractOfficialFill(task, before, after);
    fields.push({
      id: `blank-${fieldNumber}`,
      blockIndex,
      label: preparedReference?.label || (isTrainingBlank ? previousHeading(blocks, blockIndex) : blankLabel(blocks, blockIndex, before, fieldNumber)),
      before,
      after,
      referenceAnswer,
    });
  }

  if (fields.length !== 5 || fields.some((field) => !field.referenceAnswer)) return null;
  return {
    materialName: material.name,
    materialSha256: material.sha256,
    blocks,
    fields,
  };
}
