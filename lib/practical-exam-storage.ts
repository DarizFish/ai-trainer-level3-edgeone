import type { PracticalTask } from "./content";
import { examBlueprint } from "./exam-blueprint.ts";
import { createPracticalResponseExercise } from "./practical-response-exercise.ts";
import { createPracticalWordExercise } from "./practical-word-exercise.ts";
import { scorePractical, type PracticalRubricScores } from "./scoring.ts";

export const PRACTICAL_MOCK_STORAGE_KEY = "ai-trainer-practical-mock-v4";
export const PRACTICAL_MOCK_SNAPSHOT_VERSION = 4;

export type PracticalExamMode = "official" | "random";
export type PracticalExamPhase = "running" | "review" | "result";
export type PracticalExamResult = { score: number; maxScore: number; passed: boolean };
export type PracticalExamAnswers = Record<string, Record<string, string>>;
export type PracticalExamChecks = Record<string, Record<string, boolean>>;

export type PracticalExamSnapshot = {
  version: 4;
  contentVersion: string;
  phase: PracticalExamPhase;
  mode: PracticalExamMode;
  taskCodes: string[];
  current: number;
  deadlineAt: number;
  completed: Record<string, boolean>;
  answers: PracticalExamAnswers;
  checks: PracticalExamChecks;
  rubric: Record<string, PracticalRubricScores>;
  results: Record<string, PracticalExamResult>;
};

const MAX_FIELD_LENGTH = 10_000;
const MAX_TASK_ANSWER_LENGTH = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validatePracticalExamTasks(taskCodes: unknown, allTasks: PracticalTask[]) {
  if (!Array.isArray(taskCodes) || taskCodes.length !== examBlueprint.practical.totalTasks) return null;
  if (!taskCodes.every((code): code is string => typeof code === "string") || new Set(taskCodes).size !== taskCodes.length) return null;

  const byCode = new Map(allTasks.map((task) => [task.code, task]));
  const tasks = taskCodes.map((code) => byCode.get(code));
  if (tasks.some((task) => !task)) return null;
  const restored = tasks as PracticalTask[];
  const followsBlueprint = restored.every((task, index) => {
    const examModule = examBlueprint.practical.modules[index];
    return (examModule.groups as readonly string[]).includes(task.group) && task.maxScore === examModule.maxScore;
  });
  if (!followsBlueprint || restored.reduce((sum, task) => sum + task.maxScore, 0) !== examBlueprint.practical.maxScore) return null;
  return restored;
}

function sanitizeCompleted(tasks: PracticalTask[], value: unknown) {
  if (!isRecord(value)) return {};
  const completed: Record<string, boolean> = {};
  for (const task of tasks) if (typeof value[task.code] === "boolean") completed[task.code] = value[task.code] as boolean;
  return completed;
}

export function practicalExamAnswerFieldIds(task: PracticalTask) {
  if (task.hasNotebook) return ["notes"];
  const word = createPracticalWordExercise(task);
  if (word) return word.fields.map((field) => field.id);
  const response = createPracticalResponseExercise(task);
  if (response) return response.sections.map((section) => section.id);
  return ["notes"];
}

export function sanitizePracticalExamAnswers(tasks: PracticalTask[], value: unknown) {
  if (!isRecord(value)) return {};
  const answers: PracticalExamAnswers = {};
  for (const task of tasks) {
    const rawTaskAnswers = value[task.code];
    if (!isRecord(rawTaskAnswers)) continue;
    const allowed = practicalExamAnswerFieldIds(task);
    const taskAnswers: Record<string, string> = {};
    let remaining = MAX_TASK_ANSWER_LENGTH;
    for (const fieldId of allowed) {
      const raw = rawTaskAnswers[fieldId];
      if (typeof raw !== "string" || remaining <= 0) continue;
      const answer = raw.slice(0, Math.min(MAX_FIELD_LENGTH, remaining));
      taskAnswers[fieldId] = answer;
      remaining -= answer.length;
    }
    if (Object.keys(taskAnswers).length) answers[task.code] = taskAnswers;
  }
  return answers;
}

export function sanitizePracticalExamChecks(tasks: PracticalTask[], value: unknown) {
  if (!isRecord(value)) return {};
  const checks: PracticalExamChecks = {};
  for (const task of tasks) {
    const word = createPracticalWordExercise(task);
    const rawTaskChecks = value[task.code];
    if (!word || !isRecord(rawTaskChecks)) continue;
    const taskChecks: Record<string, boolean> = {};
    for (const field of word.fields) {
      if (typeof rawTaskChecks[field.id] === "boolean") taskChecks[field.id] = rawTaskChecks[field.id] as boolean;
    }
    if (Object.keys(taskChecks).length) checks[task.code] = taskChecks;
  }
  return checks;
}

export function sanitizePracticalExamRubric(tasks: PracticalTask[], value: unknown) {
  if (!isRecord(value)) return {};
  const rubric: Record<string, PracticalRubricScores> = {};
  for (const task of tasks) {
    const rawTaskScores = value[task.code];
    if (!isRecord(rawTaskScores)) continue;
    const taskScores: PracticalRubricScores = {};
    for (const item of task.rubric) {
      if (!Object.prototype.hasOwnProperty.call(rawTaskScores, item.id)) continue;
      const score = rawTaskScores[item.id];
      if (typeof score === "number" && Number.isFinite(score) && Number.isInteger(score) && score >= 0 && score <= item.points) taskScores[item.id] = score;
    }
    if (Object.keys(taskScores).length) rubric[task.code] = taskScores;
  }
  return rubric;
}

export function calculatePracticalExamResults(tasks: PracticalTask[], rubric: Record<string, PracticalRubricScores>) {
  return Object.fromEntries(tasks.map((task) => {
    const scored = scorePractical(task, rubric[task.code] ?? {});
    return [task.code, { score: scored.score, maxScore: task.maxScore, passed: scored.score >= task.maxScore * 0.6 }];
  })) as Record<string, PracticalExamResult>;
}

function restoreVerifiedResults(tasks: PracticalTask[], rubric: Record<string, PracticalRubricScores>, value: unknown) {
  if (!isRecord(value)) return null;
  const taskCodes = new Set(tasks.map((task) => task.code));
  const resultCodes = Object.keys(value);
  if (resultCodes.length !== tasks.length || resultCodes.some((code) => !taskCodes.has(code))) return null;
  const verified = calculatePracticalExamResults(tasks, rubric);
  for (const task of tasks) {
    const candidate = value[task.code];
    if (!isRecord(candidate)) return null;
    const expected = verified[task.code];
    if (candidate.score !== expected.score || candidate.maxScore !== expected.maxScore || candidate.passed !== expected.passed) return null;
  }
  return verified;
}

export function createPracticalExamSnapshot(input: {
  contentVersion: string;
  phase: PracticalExamPhase;
  mode: PracticalExamMode;
  tasks: PracticalTask[];
  current: number;
  deadlineAt: number;
  completed: Record<string, boolean>;
  answers: PracticalExamAnswers;
  checks: PracticalExamChecks;
  rubric: Record<string, PracticalRubricScores>;
  results: Record<string, PracticalExamResult>;
}): PracticalExamSnapshot {
  return {
    version: PRACTICAL_MOCK_SNAPSHOT_VERSION,
    contentVersion: input.contentVersion,
    phase: input.phase,
    mode: input.mode,
    taskCodes: input.tasks.map((task) => task.code),
    current: input.current,
    deadlineAt: input.deadlineAt,
    completed: input.completed,
    answers: input.answers,
    checks: input.checks,
    rubric: input.rubric,
    results: input.results,
  };
}

export function restorePracticalExamSnapshot(
  serialized: string,
  allTasks: PracticalTask[],
  officialTasks: PracticalTask[],
  contentVersion: string,
  now = Date.now(),
) {
  try {
    const candidate = JSON.parse(serialized) as Partial<PracticalExamSnapshot>;
    if (candidate.version !== PRACTICAL_MOCK_SNAPSHOT_VERSION || candidate.contentVersion !== contentVersion) return null;
    if (candidate.phase !== "running" && candidate.phase !== "review" && candidate.phase !== "result") return null;
    if (candidate.mode !== "official" && candidate.mode !== "random") return null;
    if (typeof candidate.deadlineAt !== "number" || !Number.isFinite(candidate.deadlineAt) || candidate.deadlineAt <= 0) return null;

    const tasks = validatePracticalExamTasks(candidate.taskCodes, allTasks);
    if (!tasks) return null;
    if (candidate.mode === "official") {
      const officialCodes = officialTasks.map((task) => task.code);
      if (officialCodes.length !== tasks.length || tasks.some((task, index) => task.code !== officialCodes[index])) return null;
    }

    const phase: PracticalExamPhase = candidate.phase === "running" && candidate.deadlineAt <= now ? "review" : candidate.phase;
    const current = Math.min(Math.max(Number.isInteger(candidate.current) ? candidate.current as number : 0, 0), tasks.length - 1);
    const completed = sanitizeCompleted(tasks, candidate.completed);
    const answers = sanitizePracticalExamAnswers(tasks, candidate.answers);
    const checks = sanitizePracticalExamChecks(tasks, candidate.checks);
    const rubric = sanitizePracticalExamRubric(tasks, candidate.rubric);
    const verifiedResults = restoreVerifiedResults(tasks, rubric, candidate.results);
    if (phase === "result" && !verifiedResults) return null;
    const results = phase === "running" ? {} : verifiedResults ?? {};
    const snapshot: PracticalExamSnapshot = {
      version: PRACTICAL_MOCK_SNAPSHOT_VERSION,
      contentVersion,
      phase,
      mode: candidate.mode,
      taskCodes: tasks.map((task) => task.code),
      current,
      deadlineAt: candidate.deadlineAt,
      completed,
      answers,
      checks,
      rubric,
      results,
    };
    return { snapshot, tasks, completed, answers, checks, rubric, results };
  } catch {
    return null;
  }
}
