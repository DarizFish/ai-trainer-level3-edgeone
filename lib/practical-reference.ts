import type { PracticalTask } from "./content";

/**
 * Returns the non-code part of a practical reference answer. Some official
 * answers embed a completed Notebook before the report text; the Notebook is
 * rendered separately for direct code comparison, so it must not be repeated.
 */
export const WORD_ANSWER_HEADING = "Word 交付物作答示例";

export function getPracticalReferenceNarrative(task: PracticalTask): string {
  const answer = task.referenceAnswer.trim();
  if (!task.notebook?.solutionCells.length) return answer;

  // Word 题点开答案时只要 Word 作答内容。评分点列表里绝大多数是代码得分点，由
  // Notebook 判分，混在前面只会把真正要看的内容挤到下面。有作答示例就从它开始。
  const wordAnswer = answer.indexOf(WORD_ANSWER_HEADING);
  if (wordAnswer >= 0) {
    const tail = answer.slice(wordAnswer);
    const codeTail = tail.indexOf("\nPython 参考代码：");
    return (codeTail >= 0 ? tail.slice(0, codeTail) : tail).trim();
  }

  // 有的官方答案把完成版 Notebook 放在前面，再用一行「<题号>.docx」引出 Word 交付
  // 物的正文（例如 3.2.1）。这一行之后才是学员在 Word 题里要看的内容，之前全是代码。
  const deliverableMarker = answer.match(/(?:^|\n)\s*\d+(?:\.\d+)*\.docx\s*(?:\n|$)/);
  if (deliverableMarker?.index !== undefined) {
    return answer.slice(deliverableMarker.index + deliverableMarker[0].length).trim();
  }

  const reportMarker = answer.match(/(?:^|\n)（2）\s*/);
  if (reportMarker?.index !== undefined) return answer.slice(reportMarker.index + reportMarker[0].length).trim();

  const codeMarker = answer.indexOf("\nPython 参考代码：");
  if (codeMarker >= 0) return answer.slice(0, codeMarker).trim();
  return answer;
}
