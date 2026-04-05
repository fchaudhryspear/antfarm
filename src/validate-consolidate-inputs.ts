// ── Issue #340: Consolidate-PR Input Validation ──────────────────────
// Validates that all required domain step outputs are present before
// allowing consolidate-pr to create a PR. Extracted from step-ops.ts.

import { getDb } from "./db.js";

/** Critical domains — PR creation is blocked if any are missing output. */
const CRITICAL_DOMAINS = new Set(["security", "backend", "frontend", "devops", "testing"]);

/** Non-critical domains — PR is allowed but a warning is appended. */
const NON_CRITICAL_DOMAINS = new Set(["docs", "documentation", "ux", "product"]);

export interface ConsolidateValidationResult {
  blocked: boolean;
  missing: string[];
  criticalMissing: string[];
  nonCriticalMissing: string[];
  stepsChecked: number;
}

export interface Step {
  step_id: string;
  agent_id: string;
  output: string | null;
  status: string;
}

/**
 * Check all completed steps in a run for empty/missing output.
 * Returns which domains are missing and whether PR should be blocked.
 *
 * @param allSteps - All steps in the run (excluding consolidate itself)
 * @param requiredDomains - Optional list of domains to check (defaults to all critical + non-critical)
 */
export function checkAllStepsPresent(
  allSteps: Step[],
  requiredDomains?: string[],
): ConsolidateValidationResult {
  const criticalMissing: string[] = [];
  const nonCriticalMissing: string[] = [];

  // If specific domains are provided, use them; otherwise check all steps
  const domainsToCheck = requiredDomains
    ? new Set(requiredDomains.map(d => d.toLowerCase()))
    : null;

  for (const s of allSteps) {
    const hasOutput = s.output && s.output.trim().length > 0;
    if (hasOutput) continue;

    // Derive domain from step_id (strip fix-/review-/scan- prefix)
    const domain = s.step_id.replace(/^(fix-|review-|scan-)/, "").toLowerCase();

    // If specific domains requested, skip those not in the list
    if (domainsToCheck && !domainsToCheck.has(domain)) continue;

    if (CRITICAL_DOMAINS.has(domain)) {
      criticalMissing.push(domain);
    } else if (NON_CRITICAL_DOMAINS.has(domain)) {
      nonCriticalMissing.push(domain);
    } else {
      // Unknown domain — treat as critical to be safe
      criticalMissing.push(domain);
    }
  }

  return {
    blocked: criticalMissing.length > 0,
    missing: [...criticalMissing, ...nonCriticalMissing],
    criticalMissing,
    nonCriticalMissing,
    stepsChecked: allSteps.length,
  };
}

/**
 * Validate consolidate-PR inputs by querying the database for a run's steps.
 * Convenience wrapper around checkAllStepsPresent that loads steps from DB.
 *
 * @param runId - The run ID to validate
 * @param _consolidateOutput - The consolidate step's output (unused, reserved for future use)
 */
export function validateConsolidateInputs(runId: string, _consolidateOutput: string): {
  blocked: boolean;
  missingCritical: string[];
  missingNonCritical: string[];
  stepsChecked: number;
} {
  const db = getDb();
  const steps = db.prepare(
    "SELECT step_id, agent_id, output, status FROM steps WHERE run_id = ? AND step_id != 'consolidate' ORDER BY step_index ASC"
  ).all(runId) as unknown as Step[];

  const result = checkAllStepsPresent(steps);
  return {
    blocked: result.blocked,
    missingCritical: result.criticalMissing,
    missingNonCritical: result.nonCriticalMissing,
    stepsChecked: result.stepsChecked,
  };
}

export { CRITICAL_DOMAINS, NON_CRITICAL_DOMAINS };
