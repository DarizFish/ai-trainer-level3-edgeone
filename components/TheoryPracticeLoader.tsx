"use client";

import TheoryPractice from "./TheoryPractice";
import { TheoryBankLoading, useTheoryBank } from "./TheoryBankLoader";

export default function TheoryPracticeLoader({ contentVersion }: { contentVersion: string }) {
  const { bank, error, retry } = useTheoryBank(contentVersion);
  return bank
    ? <TheoryPractice questions={bank.questions} contentVersion={contentVersion} />
    : <TheoryBankLoading error={error} retry={retry} />;
}
