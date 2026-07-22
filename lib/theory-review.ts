export type TheoryReviewFilter = "all" | "wrong" | "unanswered";

export const THEORY_REVIEW_PAGE_SIZE = 20;

export function getTheoryReviewPage(
  wrongQuestionIds: string[],
  unansweredQuestionIds: string[],
  filter: TheoryReviewFilter,
  requestedPage: number,
) {
  const wrong = [...new Set(wrongQuestionIds)];
  const wrongSet = new Set(wrong);
  const unanswered = [...new Set(unansweredQuestionIds)].filter((id) => !wrongSet.has(id));
  const ids = filter === "wrong" ? wrong : filter === "unanswered" ? unanswered : [...wrong, ...unanswered];
  const pageCount = Math.max(1, Math.ceil(ids.length / THEORY_REVIEW_PAGE_SIZE));
  const page = Math.min(Math.max(0, Math.trunc(requestedPage) || 0), pageCount - 1);
  const offset = page * THEORY_REVIEW_PAGE_SIZE;
  const visibleIds = ids.slice(offset, offset + THEORY_REVIEW_PAGE_SIZE);

  return {
    ids,
    visibleIds,
    page,
    pageCount,
    start: ids.length ? offset + 1 : 0,
    end: offset + visibleIds.length,
  };
}
