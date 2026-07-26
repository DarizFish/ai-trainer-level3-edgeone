const REQUIREMENT_MARKER = /^(?:（\d+）|\(\d+\)|\d+、)/;

/**
 * Extracts only the official top-level numbered tasks used by practical
 * descriptions. Decimal questionnaire items such as `1.` intentionally remain
 * inside their parent task.
 *
 * @param {string} description
 * @returns {{
 *   introduction: string;
 *   requirements: Array<{ marker: string; text: string }>;
 * }}
 */
export function parsePracticalRequirements(description) {
  const introductionLines = [];
  const requirements = [];
  let current = null;

  for (const rawLine of description.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const marker = line.match(REQUIREMENT_MARKER)?.[0];

    if (marker) {
      current = {
        marker,
        text: line.slice(marker.length).trim(),
      };
      requirements.push(current);
      continue;
    }

    if (current) {
      if (line) current.text += `${current.text ? "\n" : ""}${line}`;
      continue;
    }

    introductionLines.push(rawLine);
  }

  return {
    introduction: introductionLines.join("\n").trim(),
    requirements,
  };
}
