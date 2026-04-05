// ── Issue #337: Output Schema Enforcement ────────────────────────────
// Validates step output against required fields per agent role.
// Extracted from step-ops.ts for standalone use and testability.

import type { AgentRole } from "./installer/types.js";
import { inferRole } from "./installer/install.js";

/**
 * Required output fields per agent role.
 * Review agents: STATUS + SCORE + FINDINGS
 * Fix/coding agents: STATUS + CHANGES + FILES_MODIFIED
 * PR agents: STATUS + PR_URL
 */
const ROLE_REQUIRED_FIELDS: Record<AgentRole, string[]> = {
  analysis:     ["STATUS", "SCORE", "FINDINGS"],
  coding:       ["STATUS", "CHANGES", "FILES_MODIFIED"],
  verification: ["STATUS", "SCORE", "FINDINGS"],
  testing:      ["STATUS", "SCORE", "FINDINGS"],
  pr:           ["STATUS", "PR_URL"],
  scanning:     ["STATUS", "SCORE", "FINDINGS"],
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; missingFields: string[]; reason: string };

/**
 * Validate step output against the required schema for the agent's role.
 * Returns { valid: true } or { valid: false, missingFields: [...], reason: "..." }.
 *
 * @param output - The raw output string from the agent
 * @param agentType - The agent ID (e.g. "swarm-code-fix-v1_fix-security")
 */
export function validateStepOutput(
  output: string,
  agentType: string,
): ValidationResult {
  if (!output || output.trim().length === 0) {
    return { valid: false, missingFields: ["*"], reason: "Output is empty" };
  }

  // Derive role from agent ID (strip workflow prefix)
  const underscoreIdx = agentType.indexOf("_");
  const localId = underscoreIdx > 0 ? agentType.slice(underscoreIdx + 1) : agentType;
  const role = inferRole(localId);
  const requiredFields = ROLE_REQUIRED_FIELDS[role];
  if (!requiredFields || requiredFields.length === 0) return { valid: true };

  const presentKeys = new Set(parseOutputKeys(output));

  const missingFields = requiredFields.filter((field) => !presentKeys.has(field));
  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      reason: `Missing required fields for role "${role}": ${missingFields.join(", ")}`,
    };
  }
  return { valid: true };
}

/**
 * Extract UPPER_SNAKE_CASE keys from step output.
 * Matches lines like "STATUS: done", "SCORE: 85", etc.
 */
function parseOutputKeys(output: string): string[] {
  const keys: string[] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+):\s*/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

export { ROLE_REQUIRED_FIELDS };
