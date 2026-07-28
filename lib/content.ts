// 题库来自 data/entities/ 的实体层，不再是一个 944KB 的单行大文件。
// index.ts 由 scripts/build-entity-index.mjs 生成（需提交），contracts 校验其与目录一致。
import { contentBank } from "@/data/entities";
import { examBlueprint } from "./exam-blueprint";

export type AnswerSource = "official" | "derived";
export type AnswerBasis = "manual_official" | "third_party_reference" | "editorial_review" | "heuristic";
export type PracticalAnswerBasis = "manual_official" | "completed_reference_notebook" | "official_dataset_analysis" | "official_template_completion" | "official_task_rubric_example" | "official_rubric";
export type TheoryType = "judge" | "single" | "multi";
export type TheoryReviewBasis = "official_word" | "secondary_site" | "independent_editorial" | "independent_review";

export type TheoryQuestion = {
  id: string;
  index: number;
  type: TheoryType;
  typeLabel: string;
  category: string;
  section: string;
  stem: string;
  options: string[];
  answer: string[];
  answerSource: AnswerSource;
  answerBasis: AnswerBasis;
  confidence: "high" | "medium" | "low";
  explanation: string;
  points: number;
};

export type RubricItem = {
  id: string;
  points: number;
  description: string;
  mode: "auto" | "self";
};

export type NotebookTemplate = {
  cells: { id: string; source: string }[];
  solutionCells: { id: string; source: string }[];
  solutionSource: "completed_reference_notebook";
  solutionSha256: string;
  assets: string[];
  browserAdapted?: boolean;
};

export type PracticalMaterial = {
  name: string;
  kind: "spreadsheet" | "dataset" | "document" | "notebook" | "model" | "image" | "text" | "code" | "other";
  label: string;
  size: number;
  sha256: string;
  note: string;
  url: string | null;
  preview?: Array<{
    kind: "heading" | "list" | "paragraph";
    text: string;
  }>;
};

export type OfficialTaskSheet = {
  equipmentRequirements: string;
  skillRequirements: string;
  qualityIndicators: string;
};

export type PracticalTask = {
  code: string;
  title: string;
  category: string;
  unit: string;
  group: string;
  durationMinutes: number;
  maxScore: number;
  description: string;
  officialTaskSheet: OfficialTaskSheet;
  rubric: RubricItem[];
  answerSource: AnswerSource;
  answerBasis: PracticalAnswerBasis;
  referenceAnswer: string;
  materials: PracticalMaterial[];
  hasNotebook: boolean;
  notebook: NotebookTemplate | null;
};

export type ContentBank = {
  version: string;
  generatedFrom: string;
  theoryReference: {
    snapshotVersion: string;
    sourceUrl: string;
    capturedAt: string;
    strictMatchedQuestions: number;
    appliedDerivedAnswers: number;
    unmatchedDerivedAnswers: number;
    editorialReviewVersion: string;
    editorialReviewedAnswers: number;
    remainingHeuristicAnswers: number;
    reviewBatchId: string;
    reviewVersion: string;
    reviewedQuestions: number;
    independentExplanations: number;
    resolvedConflicts: number;
  };
  theoryReview: {
    batchId: string;
    version: string;
    publishedAt: string;
    reviewedQuestions: number;
    independentExplanations: number;
    crossReviewedQuestions: number;
    crossReviewShards: number;
    answerChanges: number;
    officialAnswerChanges: number;
    resolvedConflicts: number;
    basisCounts: Partial<Record<TheoryReviewBasis, number>>;
    manifestPath: string;
    manifestSha256: string;
    auditPath: string;
  };
  notebookSolutions: {
    snapshotVersion: string;
    capturedAt: string;
    notebookSolutions: number;
    derivedNotebookSolutions: number;
    solutionsWithBlanks: number;
  };
  practicalReferences: {
    snapshotVersion: string;
    capturedAt: string;
    analysisTool: string;
    analyzedTasks: number;
  };
  practicalTemplateReferences: {
    snapshotVersion: string;
    capturedAt: string;
    reviewMethod: "official_docx_blank_slots";
    reviewedTasks: number;
    filledBlankSlots: number;
  };
  practicalRubricReferences: {
    snapshotVersion: string;
    capturedAt: string;
    reviewMethod: "official_task_and_rubric_editorial";
    reviewedTasks: number;
    coveredRubricItems: number;
  };
  theory: TheoryQuestion[];
  officialTheoryMock: {
    id: string;
    title: string;
    durationMinutes: number;
    passingScore: number;
    questionIds: string[];
    distribution: Record<TheoryType, number>;
    maxScore: number;
  };
  practical: PracticalTask[];
  officialPracticalMockCodes: string[];
  stats: {
    theoryQuestions: number;
    officialTheoryAnswers: number;
    derivedTheoryAnswers: number;
    practicalTasks: number;
    notebookTasks: number;
    officialPracticalAnswers: number;
  };
};

export const content = contentBank as unknown as ContentBank;

export const theoryById = new Map(content.theory.map((question) => [question.id, question]));
export const practicalByCode = new Map(content.practical.map((task) => [task.code, task]));

export function getOfficialTheoryMock(): TheoryQuestion[] {
  return content.officialTheoryMock.questionIds.map((id) => theoryById.get(id)).filter(Boolean) as TheoryQuestion[];
}

export function getOfficialPracticalMock(): PracticalTask[] {
  return content.officialPracticalMockCodes.map((code) => practicalByCode.get(code)).filter(Boolean) as PracticalTask[];
}

export function createRandomTheoryMock(seed = Date.now()): TheoryQuestion[] {
  let state = seed >>> 0;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const take = (type: TheoryType, count: number) => content.theory
    .filter((question) => question.type === type)
    .map((question) => ({ question, order: random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map(({ question }) => question);
  return [
    ...take("judge", examBlueprint.theory.types.judge.count),
    ...take("single", examBlueprint.theory.types.single.count),
    ...take("multi", examBlueprint.theory.types.multi.count),
  ];
}

export function createRandomPracticalMock(seed = Date.now()): PracticalTask[] {
  let state = seed >>> 0;
  const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  const pick = (groups: string[]) => {
    const pool = content.practical.filter((task) => groups.includes(task.group));
    return pool[Math.floor(random() * pool.length)];
  };
  return examBlueprint.practical.modules.map((module) => pick([...module.groups]));
}
