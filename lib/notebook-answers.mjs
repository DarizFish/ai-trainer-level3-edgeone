// Remove comments without cutting a # inside a Python string.
export function codeOnly(line) {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "#") {
      return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

const BLANK_PATTERN = /_{3,}/g;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
}

export function extractBlankAnswers(templateLine, completedLine) {
  templateLine = codeOnly(templateLine);
  completedLine = codeOnly(completedLine);
  const matches = [...templateLine.matchAll(BLANK_PATTERN)];
  if (matches.length === 0) return [];
  let cursor = 0;
  let pattern = "^";
  for (const match of matches) {
    pattern += escapeRegExp(templateLine.slice(cursor, match.index));
    pattern += "(.*?)";
    cursor = (match.index ?? 0) + match[0].length;
  }
  pattern += escapeRegExp(templateLine.slice(cursor)) + "$";
  const result = completedLine.match(new RegExp(pattern));
  return result ? result.slice(1).map(value => value.trim()) : null;
}

function lineHasTemplateAnchors(templateLine, candidate) {
  templateLine = codeOnly(templateLine);
  candidate = codeOnly(candidate);
  const anchors = templateLine.split(BLANK_PATTERN).map(value => value.trim()).filter(value => value.length >= 2);
  if (anchors.length === 0) return false;
  let cursor = 0;
  for (const anchor of anchors) {
    const next = candidate.indexOf(anchor, cursor);
    if (next < 0) return false;
    cursor = next + anchor.length;
  }
  return true;
}

function locateCompletedLine(templateLine, lines, expectedIndex) {
  const expected = lines[expectedIndex];
  if (typeof expected === "string" && (extractBlankAnswers(templateLine, expected) || lineHasTemplateAnchors(templateLine, expected))) return expected;
  const candidates = lines.filter(line => lineHasTemplateAnchors(templateLine, line));
  return candidates.length === 1 ? candidates[0] : null;
}

export function buildFillReferences(templateCells, solutionCells) {
  const pairedSolutions = solutionCells.length === templateCells.length;
  const combinedReferenceLines = solutionCells.length === 1 ? solutionCells[0].source.replaceAll("\r", "").split("\n") : [];
  let combinedLineOffset = 0;

  return templateCells.map((cell, cellIndex) => {
    const templateLines = cell.source.replaceAll("\r", "").split("\n");
    const referenceLines = pairedSolutions
      ? solutionCells[cellIndex].source.replaceAll("\r", "").split("\n")
      : combinedReferenceLines;
    const expectedOffset = pairedSolutions ? 0 : combinedLineOffset;
    const items = templateLines.flatMap((templateLine, lineIndex) => {
      if (![...templateLine.matchAll(BLANK_PATTERN)].length) return [];
      const referenceLine = locateCompletedLine(templateLine, referenceLines, expectedOffset + lineIndex)
        ?? referenceLines[expectedOffset + lineIndex]
        ?? "";
      return [{
        lineIndex,
        templateLine,
        referenceLine,
        answers: extractBlankAnswers(templateLine, referenceLine) ?? [referenceLine.trim()],
      }];
    });
    combinedLineOffset += templateLines.length + 2;
    return { cellId: cell.id, items };
  }).filter(cell => cell.items.length > 0);
}

