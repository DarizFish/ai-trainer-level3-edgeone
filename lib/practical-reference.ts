import type { PracticalTask } from "./content";

/**
 * Returns the non-code part of a practical reference answer. Some official
 * answers embed a completed Notebook before the report text; the Notebook is
 * rendered separately for direct code comparison, so it must not be repeated.
 */
export function getPracticalReferenceNarrative(task: PracticalTask): string {
  const answer = task.referenceAnswer.trim();
  if (!task.notebook?.solutionCells.length) return answer;

  const reportMarker = answer.match(/(?:^|\n)（2）\s*/);
  if (reportMarker?.index !== undefined) return answer.slice(reportMarker.index + reportMarker[0].length).trim();

  const codeMarker = answer.indexOf("\nPython 参考代码：");
  if (codeMarker >= 0) return answer.slice(0, codeMarker).trim();
  return answer;
}
