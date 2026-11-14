type NotebookCodeCell = { id: string; source: string };

export type FillReferenceItem = {
  lineIndex: number;
  templateLine: string;
  referenceLine: string;
  answers: string[];
};

export type FillReferenceCell = {
  cellId: string;
  items: FillReferenceItem[];
};

export function codeOnly(line: string): string;
export function extractBlankAnswers(templateLine: string, completedLine: string): string[] | null;
export function buildFillReferences(templateCells: NotebookCodeCell[], solutionCells: NotebookCodeCell[]): FillReferenceCell[];
