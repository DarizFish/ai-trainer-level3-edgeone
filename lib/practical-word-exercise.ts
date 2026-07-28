import type { PracticalMaterial, PracticalTask } from "./content.ts";
import { getPracticalWordAnswer, type WordAnswerFill } from "./practical-word-answer.ts";

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

/**
 * 模板题的 5 处参考填写。此前是把 referenceAnswer 按行扫描，挑出以「填写：」开头的
 * 行，再把上一行当标题，标题还要剥掉序号和「｜学习目标」后缀。官方口径的排版一变
 * 就什么都扫不到，而扫不到的后果是整道题的作答界面直接消失（下面的 fields 校验
 * 不过，返回 null），不报错。现在直接读实体层的 fills，order 即模板中空白的顺序。
 */
function referenceFills(task: PracticalTask): WordAnswerFill[] | null {
  const deliverable = getPracticalWordAnswer(task)?.deliverables[0];
  const fills = [...(deliverable?.fills ?? [])].sort((left, right) => left.order - right.order);
  if (!fills.length) return null;
  if (fills.some((fill, index) => fill.order !== index + 1 || !fill.answer.trim() || !fill.label.trim())) return null;
  return fills;
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
  const preparedReferences = referenceFills(task);
  if (!preparedReferences) return null;
  const fields: WordExerciseField[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const isTrainingBlank = task.group === "4.1" && block.text === "学习目标：";
    const underline = task.group === "4.2" ? UNDERLINE_BLANK.exec(block.text) : null;
    if (!isTrainingBlank && !underline) continue;

    const before = isTrainingBlank ? block.text : block.text.slice(0, underline!.index);
    const after = isTrainingBlank ? "" : block.text.slice(underline!.index + underline![0].length);
    const fieldNumber = fields.length + 1;
    const preparedReference = preparedReferences[fieldNumber - 1];
    const referenceAnswer = preparedReference?.answer ?? "";
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
