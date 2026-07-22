import { getDb } from "@/db";

export function ensureAccountSchema(): Promise<void> {
  // The EdgeOne deployment applies versioned PostgreSQL migrations before
  // serving traffic. Initializing the database client here keeps configuration
  // failures close to the account request without issuing runtime DDL.
  getDb();
  return Promise.resolve();
}

export function describeErrorChain(cause: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;

  for (let depth = 0; current && depth < 8 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) messages.push(`${current.name}: ${current.message}`);
    else messages.push(String(current));
    current = typeof current === "object" && current && "cause" in current
      ? (current as { cause?: unknown }).cause
      : null;
  }

  return messages.join("\n");
}
