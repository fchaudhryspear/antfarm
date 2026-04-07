// ── Issue #337: Output Schema Enforcement ────────────────────────────
// Validates step output against required fields per agent role.
// Extracted from step-ops.ts for standalone use and testability.

/**
 * Agent schema based on workflow prefix.
 * The full agent ID carries the workflow signal (review vs fix) — preserve it.
 * Fallback to 'review' is safer (less likely to false-reject).
 */
export function getAgentSchema(agentId: string): "review" | "fix" | "consolidate" {
  if (agentId.includes("consolidate")) return "consolidate";
  if (agentId.includes("swarm-code-review")) return "review";
  if (agentId.includes("swarm-code-fix")) return "fix";
  return "review"; // safe default
}

/**
 * Required output fields per schema.
 * review:  STATUS + SCORE + FINDINGS  (review / analysis agents)
 * fix:    STATUS + CHANGES + FILES_MODIFIED  (coding / fixer agents)
 * consolidate: STATUS + PR_URL  (PR/submission agents)
 */
const SCHEMA_REQUIRED_FIELDS: Record<string, string[]> = {
  review:      ["STATUS", "SCORE", "FINDINGS"],
  fix:         ["STATUS", "CHANGES", "FILES_MODIFIED"],
  consolidate: ["STATUS", "PR_URL"],
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; missingFields: string[]; reason: string };

/**
 * Validate step output against the required schema for the agent's workflow.
 * Returns { valid: true } or { valid: false, missingFields: [...], reason: "..." }.
 *
 * @param output - The raw output string from the agent
 * @param agentId - The full agent ID (e.g. "swarm-code-review-v3_code-quality")
 */
export function validateStepOutput(
  output: string,
  agentId: string,
): ValidationResult {
  if (!output || output.trim().length === 0) {
    return { valid: false, missingFields: ["*"], reason: "Output is empty" };
  }

  const schema = getAgentSchema(agentId);
  const requiredFields = SCHEMA_REQUIRED_FIELDS[schema] ?? [];
  if (requiredFields.length === 0) return { valid: true };

  const presentKeys = new Set(parseOutputKeys(output));

  const missingFields = requiredFields.filter((field) => !presentKeys.has(field));

  // For review schema: STATUS is optional when SCORE is present.
  // The score IS the completion signal — agents reliably produce SCORE but often skip STATUS.
  if (schema === "review" && missingFields.length === 1 && missingFields[0] === "STATUS" && presentKeys.has("SCORE")) {
    return { valid: true };
  }
  // For fix schema: STATUS is optional when CHANGES is present.
  if (schema === "fix" && missingFields.length === 1 && missingFields[0] === "STATUS" && presentKeys.has("CHANGES")) {
    return { valid: true };
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      reason: `Missing required fields for schema "${schema}": ${missingFields.join(", ")}`,
    };
  }
  return { valid: true };
}

// ── Fix #4 (RCA 322-325): Case-insensitive key parsing + markdown strip ──────────
/**
 * Strip markdown code fences and normalize whitespace before key extraction.
 * Handles agent outputs wrapped in ```...``` or indented code blocks.
 */
function stripMarkdown(output: string): string {
  return output
    .replace(/```[\s\S]*?```/g, "") // remove fenced code blocks
    .replace(/^\s*`([^`]+)`\s*$/gm, "$1") // remove inline backtick wrappers
    .trim();
}

/**
 * Extract UPPER_SNAKE_CASE keys from step output.
 * Fix #4: Case-insensitive match + multiline mode + markdown strip.
 * Matches lines like "STATUS: done", "SCORE: 85", also "score: 72" (normalized to uppercase).
 */
function parseOutputKeys(output: string): string[] {
  const keys: string[] = [];
  const cleaned = stripMarkdown(output);
  for (const line of cleaned.split("\n")) {
    // Case-insensitive: match any case, normalize to uppercase for comparison
    const match = line.match(/^([A-Za-z_]+):\s*/);
    if (match) keys.push(match[1].toUpperCase());
  }
  return keys;
}

export { SCHEMA_REQUIRED_FIELDS };
