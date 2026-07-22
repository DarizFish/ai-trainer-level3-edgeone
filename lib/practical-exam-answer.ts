import type { PracticalTask } from "./content.ts";
import { createPracticalResponseExercise } from "./practical-response-exercise.ts";
import { createPracticalWordExercise } from "./practical-word-exercise.ts";

export function practicalExamAnswerProgress(task: PracticalTask, answers: Record<string, string>) {
  const word = createPracticalWordExercise(task);
  if (word) {
    return {
      completed: word.fields.filter((field) => answers[field.id]?.trim()).length,
      total: word.fields.length,
      label: "处填写",
    };
  }
  const response = createPracticalResponseExercise(task);
  if (response) {
    return {
      completed: response.sections.filter((section) => answers[section.id]?.trim()).length,
      total: response.sections.length,
      label: "份交付物",
    };
  }
  return { completed: answers.notes?.trim() ? 1 : 0, total: 1, label: task.hasNotebook ? "份运行说明" : "份作答" };
}

export function formatPracticalExamAnswer(task: PracticalTask, answers: Record<string, string>) {
  const word = createPracticalWordExercise(task);
  if (word) {
    return [
      `网页逐空作答：${word.materialName}`,
      ...word.fields.flatMap((field, index) => ["", `${index + 1}. ${field.label}`, answers[field.id]?.trim() || "（未填写）"]),
    ].join("\n").slice(0, 20_000);
  }
  const response = createPracticalResponseExercise(task);
  if (response) {
    return response.sections.flatMap((section) => [
      `${section.number}. ${section.title}（${section.outputLabel}）`,
      answers[section.id]?.trim() || "（未填写）",
      "",
    ]).join("\n").trim().slice(0, 20_000);
  }
  return (answers.notes ?? "").slice(0, 20_000);
}
