import type { TheoryQuestion, TheoryType } from "./content";
import { examBlueprint } from "./exam-blueprint.ts";
import { scoreTheory } from "./scoring.ts";

export const THEORY_MOCK_STORAGE_KEY = "ai-trainer-theory-mock-v2";
export const THEORY_MOCK_SNAPSHOT_VERSION = 2;

export type TheoryExamMode = "official" | "random";
export type TheoryExamResult = ReturnType<typeof scoreTheory>;

type TheoryExamSnapshotBase = {
  version: 2;
  contentVersion: string;
  mode: TheoryExamMode;
  questionIds: string[];
  answers: Record<string, string[]>;
  current: number;
  deadlineAt: number;
};

export type ActiveTheoryExamSnapshot = TheoryExamSnapshotBase & { phase: "active" };
export type FinishedTheoryExamSnapshot = TheoryExamSnapshotBase & {
  phase: "finished";
  completedAt: number;
  result: TheoryExamResult;
};
export type TheoryExamSnapshot = ActiveTheoryExamSnapshot | FinishedTheoryExamSnapshot;

function validAnswerValues(question: TheoryQuestion) {
  return question.type === "judge"
    ? new Set(["√", "×"])
    : new Set(question.options.map((_, index) => String.fromCharCode(65 + index)));
}

export function sanitizeTheoryExamAnswers(questions: TheoryQuestion[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const byId = new Map(questions.map((question) => [question.id, question]));
  const sanitized: Record<string, string[]> = {};
  for (const [id, rawAnswer] of Object.entries(value)) {
    const question = byId.get(id);
    if (!question || !Array.isArray(rawAnswer)) continue;
    const valid = validAnswerValues(question);
    const answer = [...new Set(rawAnswer.filter((item): item is string => typeof item === "string" && valid.has(item)))];
    if (!answer.length || (question.type !== "multi" && answer.length !== 1)) continue;
    sanitized[id] = answer;
  }
  return sanitized;
}

function hasOfficialDistribution(questions: TheoryQuestion[]) {
  const counts = Object.fromEntries((Object.keys(examBlueprint.theory.types) as TheoryType[]).map((type) => [type, questions.filter((question) => question.type === type).length]));
  return (Object.keys(examBlueprint.theory.types) as TheoryType[]).every((type) => counts[type] === examBlueprint.theory.types[type].count);
}

export function createActiveTheoryExamSnapshot(input: {
  contentVersion: string;
  mode: TheoryExamMode;
  questions: TheoryQuestion[];
  answers: Record<string, string[]>;
  current: number;
  deadlineAt: number;
}): ActiveTheoryExamSnapshot {
  return {
    version: THEORY_MOCK_SNAPSHOT_VERSION,
    phase: "active",
    contentVersion: input.contentVersion,
    mode: input.mode,
    questionIds: input.questions.map((question) => question.id),
    answers: input.answers,
    current: input.current,
    deadlineAt: input.deadlineAt,
  };
}

export function createFinishedTheoryExamSnapshot(input: {
  contentVersion: string;
  mode: TheoryExamMode;
  questions: TheoryQuestion[];
  answers: Record<string, string[]>;
  current: number;
  deadlineAt: number;
  result: TheoryExamResult;
  completedAt?: number;
}): FinishedTheoryExamSnapshot {
  return {
    ...createActiveTheoryExamSnapshot(input),
    phase: "finished",
    completedAt: input.completedAt ?? Date.now(),
    result: input.result,
  };
}

export function restoreTheoryExamSnapshot(serialized: string, allQuestions: TheoryQuestion[], contentVersion: string) {
  try {
    const candidate = JSON.parse(serialized) as Partial<TheoryExamSnapshot>;
    if (candidate.version !== THEORY_MOCK_SNAPSHOT_VERSION || candidate.contentVersion !== contentVersion) return null;
    if (candidate.phase !== "active" && candidate.phase !== "finished") return null;
    if (candidate.mode !== "official" && candidate.mode !== "random") return null;
    if (!Array.isArray(candidate.questionIds) || candidate.questionIds.length !== examBlueprint.theory.totalQuestions || new Set(candidate.questionIds).size !== examBlueprint.theory.totalQuestions) return null;
    if (typeof candidate.deadlineAt !== "number" || !Number.isFinite(candidate.deadlineAt) || candidate.deadlineAt <= 0) return null;

    const byId = new Map(allQuestions.map((question) => [question.id, question]));
    const questions = candidate.questionIds.map((id) => byId.get(id)).filter(Boolean) as TheoryQuestion[];
    if (questions.length !== examBlueprint.theory.totalQuestions || !hasOfficialDistribution(questions)) return null;
    const answers = sanitizeTheoryExamAnswers(questions, candidate.answers);
    const current = Math.min(Math.max(Number.isInteger(candidate.current) ? candidate.current as number : 0, 0), questions.length - 1);

    if (candidate.phase === "finished") {
      if (typeof candidate.completedAt !== "number" || !Number.isFinite(candidate.completedAt) || candidate.completedAt <= 0 || !candidate.result) return null;
      const verifiedResult = scoreTheory(questions, answers);
      if (JSON.stringify(verifiedResult) !== JSON.stringify(candidate.result)) return null;
      return { snapshot: { ...candidate, answers, current } as FinishedTheoryExamSnapshot, questions, answers, result: verifiedResult };
    }

    return { snapshot: { ...candidate, answers, current } as ActiveTheoryExamSnapshot, questions, answers, result: null };
  } catch {
    return null;
  }
}
