// 由 scripts/build-entity-index.mjs 生成，请勿手工编辑。
// 实体层：data/entities/ 下按实体切分的题库资产。改一道题只碰一个小文件，
// 而不是重排 944KB 的单行大文件——那种 diff 是没法评审的。

import judgeQuestions from "./theory/judge.json";
import singleQuestions from "./theory/single.json";
import multiQuestions from "./theory/multi.json";

import t1_1_1 from "./practical/1.1.1.json";
import t1_1_2 from "./practical/1.1.2.json";
import t1_1_3 from "./practical/1.1.3.json";
import t1_1_4 from "./practical/1.1.4.json";
import t1_1_5 from "./practical/1.1.5.json";
import t1_2_1 from "./practical/1.2.1.json";
import t1_2_2 from "./practical/1.2.2.json";
import t1_2_3 from "./practical/1.2.3.json";
import t1_2_4 from "./practical/1.2.4.json";
import t1_2_5 from "./practical/1.2.5.json";
import t2_1_1 from "./practical/2.1.1.json";
import t2_1_2 from "./practical/2.1.2.json";
import t2_1_3 from "./practical/2.1.3.json";
import t2_1_4 from "./practical/2.1.4.json";
import t2_1_5 from "./practical/2.1.5.json";
import t2_2_1 from "./practical/2.2.1.json";
import t2_2_2 from "./practical/2.2.2.json";
import t2_2_3 from "./practical/2.2.3.json";
import t2_2_4 from "./practical/2.2.4.json";
import t2_2_5 from "./practical/2.2.5.json";
import t3_1_1 from "./practical/3.1.1.json";
import t3_1_2 from "./practical/3.1.2.json";
import t3_1_3 from "./practical/3.1.3.json";
import t3_1_4 from "./practical/3.1.4.json";
import t3_1_5 from "./practical/3.1.5.json";
import t3_2_1 from "./practical/3.2.1.json";
import t3_2_2 from "./practical/3.2.2.json";
import t3_2_3 from "./practical/3.2.3.json";
import t3_2_4 from "./practical/3.2.4.json";
import t3_2_5 from "./practical/3.2.5.json";
import t4_1_1 from "./practical/4.1.1.json";
import t4_1_2 from "./practical/4.1.2.json";
import t4_1_3 from "./practical/4.1.3.json";
import t4_1_4 from "./practical/4.1.4.json";
import t4_1_5 from "./practical/4.1.5.json";
import t4_2_1 from "./practical/4.2.1.json";
import t4_2_2 from "./practical/4.2.2.json";
import t4_2_3 from "./practical/4.2.3.json";
import t4_2_4 from "./practical/4.2.4.json";
import t4_2_5 from "./practical/4.2.5.json";

import meta from "./meta.json";
import theoryOfficialExam from "./exams/theory-official.json";
import practicalOfficialExam from "./exams/practical-official.json";
import theoryReference from "./audit/theory-reference.json";
import notebookSolutions from "./audit/notebook-solutions.json";
import practicalReferences from "./audit/practical-references.json";
import practicalTemplateReferences from "./audit/practical-template-references.json";
import practicalRubricReferences from "./audit/practical-rubric-references.json";
import theoryReview from "./audit/theory-review.json";

// 顺序即原有 ContentBank 的顺序：理论是 judge/single/multi 三段、段内按 id 递增，
// 实操按题号排序。contracts 断言拼装结果与发布产物一致。
const theory = [...judgeQuestions, ...singleQuestions, ...multiQuestions];
const practical = [t1_1_1, t1_1_2, t1_1_3, t1_1_4, t1_1_5, t1_2_1, t1_2_2, t1_2_3, t1_2_4, t1_2_5, t2_1_1, t2_1_2, t2_1_3, t2_1_4, t2_1_5, t2_2_1, t2_2_2, t2_2_3, t2_2_4, t2_2_5, t3_1_1, t3_1_2, t3_1_3, t3_1_4, t3_1_5, t3_2_1, t3_2_2, t3_2_3, t3_2_4, t3_2_5, t4_1_1, t4_1_2, t4_1_3, t4_1_4, t4_1_5, t4_2_1, t4_2_2, t4_2_3, t4_2_4, t4_2_5];

// stats 是推导值，不存储——存储就意味着可能与实体不一致。
const stats = {
  theoryQuestions: theory.length,
  officialTheoryAnswers: theory.filter(q => q.answerSource === "official").length,
  derivedTheoryAnswers: theory.filter(q => q.answerSource !== "official").length,
  practicalTasks: practical.length,
  notebookTasks: practical.filter(t => t.hasNotebook).length,
  officialPracticalAnswers: practical.filter(t => t.answerSource === "official").length,
};

export const contentBank = {
  version: meta.version,
  generatedFrom: meta.generatedFrom,
  theoryReference,
  notebookSolutions,
  practicalReferences,
  practicalTemplateReferences,
  practicalRubricReferences,
  theoryReview,
  theory,
  officialTheoryMock: theoryOfficialExam,
  practical,
  officialPracticalMockCodes: practicalOfficialExam.taskCodes,
  stats,
};
