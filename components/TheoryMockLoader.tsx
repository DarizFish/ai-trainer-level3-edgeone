"use client";

import TheoryMock from "./TheoryMock";
import { TheoryBankLoading, useTheoryBank } from "./TheoryBankLoader";

export default function TheoryMockLoader({ contentVersion }: { contentVersion: string }) {
  const { bank, error, retry } = useTheoryBank(contentVersion);
  if (!bank) {
    return <div className="container mock-entry">
      <TheoryBankLoading error={error} retry={retry} />
    </div>;
  }

  const questionById = new Map(bank.questions.map((question) => [question.id, question]));
  const officialQuestions = bank.officialQuestionIds.flatMap((id) => {
    const question = questionById.get(id);
    return question ? [question] : [];
  });
  return <TheoryMock
    allQuestions={bank.questions}
    officialQuestions={officialQuestions}
    contentVersion={contentVersion}
  />;
}
