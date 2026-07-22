import type { PracticalTask, TheoryQuestion } from "./content";

export type PracticalRubricScores = Record<string, number>;

export function normalizeAnswer(answer: string[]) {
  return [...new Set(answer)].sort();
}

export function isCorrect(question: TheoryQuestion, answer: string[]) {
  const expected = normalizeAnswer(question.answer);
  const actual = normalizeAnswer(answer);
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

export function scoreTheory(questions: TheoryQuestion[], answers: Record<string, string[]>) {
  const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
  const score = questions.reduce((sum, question) => sum + (isCorrect(question, answers[question.id] ?? []) ? question.points : 0), 0);
  const byType = (["judge", "single", "multi"] as const).map((type) => {
    const typed = questions.filter((question) => question.type === type);
    return {
      type,
      score: typed.reduce((sum, question) => sum + (isCorrect(question, answers[question.id] ?? []) ? question.points : 0), 0),
      maxScore: typed.reduce((sum, question) => sum + question.points, 0),
      correct: typed.filter((question) => isCorrect(question, answers[question.id] ?? [])).length,
      total: typed.length,
    };
  });
  const unansweredQuestionIds = questions.filter((question) => !(answers[question.id]?.length)).map((question) => question.id);
  const wrongQuestionIds = questions.filter((question) => answers[question.id]?.length && !isCorrect(question, answers[question.id])).map((question) => question.id);
  return { score, maxScore, passed: score >= 60, byType, unansweredQuestionIds, wrongQuestionIds };
}

function normalizeRubricItemScore(maxScore: number, value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return 0;
  return Math.min(Math.max(value, 0), maxScore);
}

export function scorePractical(task: PracticalTask, selections: Record<string, unknown>) {
  const rubric = Object.fromEntries(task.rubric.map((item) => [item.id, normalizeRubricItemScore(item.points, selections[item.id])])) as PracticalRubricScores;
  const score = task.rubric.reduce((sum, item) => sum + rubric[item.id], 0);
  return { score: Math.min(score, task.maxScore), maxScore: task.maxScore, rubric };
}
