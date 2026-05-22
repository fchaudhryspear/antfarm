// ── Issue #337: Output Schema Enforcement ────────────────────────────
// Validates step output against required fields per agent role.
// Extracted from step-ops.ts for standalone use and testability.

/**
 * Agent schema based on workflow prefix.
 * The full agent ID carries the workflow signal (review vs fix) — preserve it.
 * Unknown agents are validated by step contracts elsewhere and should not be schema-rejected.
 */
export function getAgentSchema(agentId: string): "review" | "fix" | "consolidate" | null {
  if (agentId.includes("consolidate")) return "consolidate";
  if (agentId.includes("swarm-code-review")) return "review";
  if (agentId.includes("swarm-code-fix")) return "fix";
  return null;
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
  const requiredFields = schema ? (SCHEMA_REQUIRED_FIELDS[schema] ?? []) : [];
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

// ── Runtime Contract Enforcement (PR 1) ───────────────────────────────
// Validates step output against declared expects contract and dispatch status.

export type ContractValidationResult =
  | { valid: true }
  | { valid: false; missingExpects: string[]; swarmStatusInvalid?: boolean; reason: string };

/**
 * Parse expects field from step definition.
 * Supports: comma-separated string, JSON array, or single key.
 */
export function parseExpects(expectsField: string | null): string[] {
  if (!expectsField || expectsField.trim() === "") return [];
  
  // Try JSON array first
  try {
    const parsed = JSON.parse(expectsField);
    if (Array.isArray(parsed)) return parsed.map((k: string) => normalizeContractKey(k));
  } catch {
    // Not JSON, treat as comma-separated or single key
  }
  
  // Comma-separated or single key
  return expectsField
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map(normalizeContractKey);
}

/**
 * Shared dispatch-output validator.
 * Validates:
 * 1. Output keys satisfy declared expects contract
 * 2. For dispatch-style outputs, SWARM_STATUS must be "completed" or "skipped"
 *
 * @param output - The raw output string from the agent
 * @param expectsField - The step's declared expects field from DB
 * @param isDispatch - Whether this is a dispatch-style step (requires SWARM_STATUS gating)
 */
export function validateContractAndDispatch(
  output: string,
  expectsField: string | null,
  isDispatch: boolean = false,
): ContractValidationResult {
  const presentKeys = new Set(parseOutputKeys(output));
  const swarmStatus = isDispatch && presentKeys.has("SWARM_STATUS")
    ? normalizeSwarmStatus(extractOutputValue(output, "SWARM_STATUS"))
    : undefined;
  
  // 1. Validate expects contract
  const expectedKeys = parseExpects(expectsField);
  const missingExpects = expectedKeys.filter((key) => !presentKeys.has(key));
  
  // 2. Validate SWARM_STATUS for dispatch outputs
  let swarmStatusInvalid = false;
  if (isDispatch) {
    // Valid states: "completed" (sub-swarm finished), "skipped" (Tier 1 skip),
    // "dispatched" (sub-swarm polling), "running" (sub-swarm still in progress)
    // Both "dispatched" and "running" mean the controller has spawned a sub-swarm
    // and is polling for completion. The step stays in running state for cron re-poll.
    // Valid dispatch statuses: completed, skipped, dispatched, running, blocked
    // "blocked" = release step blocked by QA failure after max cycles
    if (swarmStatus !== "completed" && swarmStatus !== "skipped" && swarmStatus !== "dispatched" && swarmStatus !== "running" && swarmStatus !== "blocked") {
      swarmStatusInvalid = true;
    }
  }

  // Dispatch steps can submit polling progress before their final *_DONE key
  // exists. completeStep() stores that output and leaves the step running.
  const dispatchStillPolling = isDispatch && (swarmStatus === "dispatched" || swarmStatus === "running");
  
  // Build result
  if (missingExpects.length > 0 && !dispatchStillPolling) {
    return {
      valid: false,
      missingExpects,
      swarmStatusInvalid: isDispatch ? swarmStatusInvalid : undefined,
      reason: `Missing expected output keys: ${missingExpects.join(", ")}` + 
              (swarmStatusInvalid ? "; SWARM_STATUS must be 'completed', 'skipped', 'dispatched', 'running', or 'blocked'" : ""),
    };
  }
  
  if (swarmStatusInvalid) {
    const swarmStatus = extractOutputValue(output, "SWARM_STATUS");
    return {
      valid: false,
      missingExpects: [],
      swarmStatusInvalid: true,
      reason: `SWARM_STATUS must be 'completed', 'skipped', 'dispatched', 'running', or 'blocked', got: ${swarmStatus || "(missing)"}`,
    };
  }
  
  return { valid: true };
}

/**
 * Extract the value for a specific key from output.
 */
function extractOutputValue(output: string, key: string): string | undefined {
  const cleaned = stripMarkdown(output);
  const normalizedKey = escapeRegExp(normalizeContractKey(key));
  const regex = new RegExp(`^\\s*${normalizedKey}\\s*:\\s*(.*)$`, "im");
  const match = cleaned.match(regex);
  return match?.[1]?.trim();
}

// ── Fix #4 (RCA 322-325): Case-insensitive key parsing + markdown strip ──────────
/**
 * Strip markdown code fences and normalize whitespace before key extraction.
 * Handles agent outputs wrapped in ```...``` or indented code blocks.
 */
function stripMarkdown(output: string): string {
  return output
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1") // unwrap fenced code blocks
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
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/);
    if (match) keys.push(match[1].toUpperCase());
  }
  return keys;
}

function normalizeContractKey(key: string): string {
  return key.trim().split(":")[0].trim().toUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSwarmStatus(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().match(/^[a-z_-]+/)?.[0];
}

export { SCHEMA_REQUIRED_FIELDS };
