// ── Phase 5: Model Evaluation Scorer ─────────────────────────────────
// Scores agent step outputs across 5 dimensions per role.
// Approved spec: scoring-only (no automated actions during 2-week calibration).
// Exception: canary kill at <15/25 is enforced immediately.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { logger } from "../lib/logger.js";

const SCORES_FILE = path.join(
  os.homedir(),
  ".openclaw",
  "antfarm",
  "logs",
  "model-scores.jsonl"
);

// ── Types ────────────────────────────────────────────────────────────

export interface ScoreDimensions {
  specAlignment: number;   // 0-5: output matches architecture spec / expected schema
  completeness: number;    // 0-5: all required files/sections present
  compilation: number;     // 0-5: code compiles / valid syntax
  noHallucination: number; // 0-5: no phantom fields, functions, or references
  integration: number;     // 0-5: cross-module wiring correct
}

export interface StepScore {
  timestamp: string;
  runId: string;
  workflowId: string;
  stepId: string;
  agentId: string;
  model: string;
  role: string;
  scores: ScoreDimensions;
  total: number;
  pass: boolean;
  calibrationMode: true;  // Always true during 2-week calibration
  flags: string[];
}

// ── Scoring Thresholds ───────────────────────────────────────────────
// These are starting thresholds — will be tuned after 2-week calibration.

export const PASS_THRESHOLD = 18;    // ≥18/25 = pass
export const FAIL_THRESHOLD = 15;    // <15/25 = fail (canary kill)
export const WATCH_THRESHOLD = 17;   // 15-17 = watch zone

// ── Score Extraction ─────────────────────────────────────────────────

/**
 * Score a step output against the 5-dimension rubric.
 * Uses heuristics based on output content — not perfect, but provides
 * consistent signals for drift detection over time.
 */
export function scoreStepOutput(
  output: string,
  agentId: string,
  role: string,
  repoPath?: string,
  branch?: string
): { scores: ScoreDimensions; flags: string[] } {
  const flags: string[] = [];
  const scores: ScoreDimensions = {
    specAlignment: 0,
    completeness: 0,
    compilation: 0,
    noHallucination: 0,
    integration: 0,
  };

  if (!output || output.trim().length === 0) {
    flags.push("empty_output");
    return { scores, flags };
  }

  // ── Dimension 1: Spec Alignment ──────────────────────────────────
  scores.specAlignment = scoreSpecAlignment(output, role, flags);

  // ── Dimension 2: Completeness ────────────────────────────────────
  scores.completeness = scoreCompleteness(output, role, flags);

  // ── Dimension 3: Compilation ─────────────────────────────────────
  scores.compilation = scoreCompilation(output, role, repoPath, branch, flags);

  // ── Dimension 4: No Hallucination ────────────────────────────────
  scores.noHallucination = scoreNoHallucination(output, role, flags);

  // ── Dimension 5: Integration ─────────────────────────────────────
  scores.integration = scoreIntegration(output, role, flags);

  return { scores, flags };
}

// ── Dimension Scorers ────────────────────────────────────────────────

function scoreSpecAlignment(output: string, role: string, flags: string[]): number {
  let score = 3; // Default: neutral (can't verify spec alignment from output alone)

  // Review agents: check if SCORE is numeric and FINDINGS is structured
  if (role === "analysis") {
    const scoreMatch = output.match(/SCORE:\s*(\d+)/i);
    if (scoreMatch) {
      const numericScore = parseInt(scoreMatch[1], 10);
      if (numericScore >= 0 && numericScore <= 100) score = 4;
      else { score = 2; flags.push("score_out_of_range"); }
    } else {
      score = 1; flags.push("missing_numeric_score");
    }

    const findingsMatch = output.match(/FINDINGS:/i);
    if (findingsMatch) score = Math.min(score + 1, 5);
    else { score = Math.max(score - 1, 0); flags.push("missing_findings_section"); }
  }

  // Fix agents: check if STATUS and CHANGES are present and structured
  if (role === "coding") {
    const hasStatus = /STATUS:\s*\w+/i.test(output);
    const hasChanges = /CHANGES:/i.test(output);
    const hasFiles = /FILES_MODIFIED:/i.test(output);

    if (hasStatus && hasChanges && hasFiles) score = 5;
    else if (hasStatus && hasChanges) score = 4;
    else if (hasStatus) score = 3;
    else { score = 1; flags.push("missing_structured_output"); }
  }

  // Verification / testing agents
  if (role === "verification" || role === "testing") {
    const hasScore = /SCORE:\s*\d+/i.test(output);
    const hasFindings = /FINDINGS:/i.test(output);
    if (hasScore && hasFindings) score = 5;
    else if (hasScore) score = 4;
    else score = 2;
  }

  return score;
}

function scoreCompleteness(output: string, role: string, flags: string[]): number {
  let score = 3;

  // Check for TODO/FIXME markers (incomplete work)
  const todoCount = (output.match(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/gi) || []).length;
  if (todoCount === 0) score = 5;
  else if (todoCount <= 2) { score = 4; flags.push(`todo_count_${todoCount}`); }
  else if (todoCount <= 5) { score = 3; flags.push(`todo_count_${todoCount}`); }
  else { score = 1; flags.push(`excessive_todos_${todoCount}`); }

  // Check for placeholder patterns
  const placeholderPatterns = [
    /pass\s*#\s*TODO/gi,
    /raise NotImplementedError/gi,
    /\.\.\.\s*#/gi,
    /placeholder/gi,
  ];
  const placeholderCount = placeholderPatterns.reduce(
    (count, pattern) => count + (output.match(pattern) || []).length,
    0
  );
  if (placeholderCount > 0) {
    score = Math.max(score - 2, 0);
    flags.push(`placeholders_${placeholderCount}`);
  }

  return score;
}

function scoreCompilation(
  output: string,
  role: string,
  repoPath?: string,
  branch?: string,
  flags?: string[]
): number {
  // If we can't run compilation checks, score based on output signals
  if (!repoPath || !fs.existsSync(repoPath)) {
    // Heuristic: check for syntax error mentions in output
    const syntaxErrors = /SyntaxError|IndentationError|TypeError|ImportError|ModuleNotFoundError|TS\d{4,5}:/gi;
    if (syntaxErrors.test(output)) {
      flags?.push("syntax_errors_in_output");
      return 1;
    }
    return 3; // Neutral without repo access
  }

  // Try actual compilation check for committed files
  try {
    if (role === "coding") {
      // Python: try py_compile on modified files
      const filesMatch = output.match(/FILES_MODIFIED:\s*(.+)/i);
      if (filesMatch) {
        const files = filesMatch[1].split(",").map(f => f.trim()).filter(f => f.endsWith(".py"));
        let passed = 0;
        let total = 0;
        for (const file of files.slice(0, 10)) { // Cap at 10 files
          const fullPath = path.join(repoPath, file);
          if (!fs.existsSync(fullPath)) continue;
          total++;
          try {
            execSync(`python3 -m py_compile "${fullPath}"`, {
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
              timeout: 10_000,
            });
            passed++;
          } catch {
            flags?.push(`compile_fail_${path.basename(file)}`);
          }
        }
        if (total === 0) return 3;
        const ratio = passed / total;
        if (ratio >= 1.0) return 5;
        if (ratio >= 0.8) return 4;
        if (ratio >= 0.5) return 2;
        return 1;
      }
    }
  } catch {
    // Compilation check failed — fall back to neutral
  }

  return 3;
}

function scoreNoHallucination(output: string, role: string, flags: string[]): number {
  let score = 5; // Start perfect, deduct for hallucination signals

  // Check for phantom field patterns (fields that commonly appear in hallucinations)
  const phantomPatterns = [
    /broker_id/gi,        // Known hallucinated field from Run #276
    /billing_type/gi,     // Known hallucinated field from Run #276
    /cancel_at_period_end/gi, // Known hallucinated field
  ];
  for (const pattern of phantomPatterns) {
    if (pattern.test(output)) {
      score -= 2;
      flags.push(`known_phantom_field_${pattern.source}`);
    }
  }

  // Check for references to non-existent APIs or services
  const phantomServicePatterns = [
    /external_sofr_api/gi,  // Known hallucinated service from swarm scan
    /handle_insights.*paralleliz/gi, // Known hallucinated function
  ];
  for (const pattern of phantomServicePatterns) {
    if (pattern.test(output)) {
      score -= 1;
      flags.push(`phantom_service_reference`);
    }
  }

  // Check for excessive import statements (sign of copy-paste hallucination)
  const importCount = (output.match(/^(?:import |from .+ import )/gm) || []).length;
  if (importCount > 30) {
    score -= 1;
    flags.push(`excessive_imports_${importCount}`);
  }

  // Check for service calls that are commented out (integration gap)
  const commentedCalls = (output.match(/^#\s*(service\.|self\.|await )/gm) || []).length;
  if (commentedCalls > 0) {
    score -= 1;
    flags.push(`commented_out_service_calls_${commentedCalls}`);
  }

  return Math.max(score, 0);
}

function scoreIntegration(output: string, role: string, flags: string[]): number {
  let score = 3;

  // Coding agents: check for integration signals
  if (role === "coding") {
    // Positive: mentions of service method calls, imports from other modules
    const crossModuleImports = (output.match(/from\s+\.\w+\s+import|from\s+src\.\w+/gm) || []).length;
    if (crossModuleImports >= 3) score = 5;
    else if (crossModuleImports >= 1) score = 4;

    // Negative: commented-out service calls
    const commentedOut = (output.match(/#\s*(?:service|self|await)\./gm) || []).length;
    if (commentedOut > 0) {
      score = Math.max(score - 2, 0);
      flags.push(`commented_out_calls_${commentedOut}`);
    }

    // Negative: "pass" or "..." in function bodies (stub, not integrated)
    const stubs = (output.match(/^\s+pass\s*$/gm) || []).length;
    if (stubs > 2) {
      score = Math.max(score - 1, 0);
      flags.push(`stub_functions_${stubs}`);
    }
  }

  // Analysis/review agents: check for cross-reference analysis
  if (role === "analysis" || role === "verification") {
    const mentionsFiles = /cross[-_]?file|cross[-_]?module|integration/gi.test(output);
    if (mentionsFiles) score = 4;
  }

  return score;
}

// ── Score Persistence ────────────────────────────────────────────────

/**
 * Write a score entry to model-scores.jsonl.
 * Append-only, no enforcement — calibration mode.
 */
export function persistScore(score: StepScore): void {
  try {
    const dir = path.dirname(SCORES_FILE);
    fs.mkdirSync(dir, { recursive: true });

    // Rotate if file exceeds 10MB
    try {
      const stats = fs.statSync(SCORES_FILE);
      if (stats.size > 10 * 1024 * 1024) {
        const rotated = SCORES_FILE + ".1";
        try { fs.unlinkSync(rotated); } catch {}
        fs.renameSync(SCORES_FILE, rotated);
      }
    } catch {}

    fs.appendFileSync(SCORES_FILE, JSON.stringify(score) + "\n");
  } catch (e) {
    logger.warn(`Failed to persist model score: ${e}`);
  }
}

/**
 * Build and persist a complete score for a step.
 * Called from completeStep() in step-ops.ts.
 */
export function scoreAndPersist(params: {
  output: string;
  runId: string;
  workflowId: string;
  stepId: string;
  agentId: string;
  model: string;
  role: string;
  repoPath?: string;
  branch?: string;
}): StepScore {
  const { scores, flags } = scoreStepOutput(
    params.output,
    params.agentId,
    params.role,
    params.repoPath,
    params.branch
  );

  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);

  const stepScore: StepScore = {
    timestamp: new Date().toISOString(),
    runId: params.runId,
    workflowId: params.workflowId,
    stepId: params.stepId,
    agentId: params.agentId,
    model: params.model,
    role: params.role,
    scores,
    total,
    pass: total >= PASS_THRESHOLD,
    calibrationMode: true,
    flags,
  };

  persistScore(stepScore);

  logger.info(`Model eval score: ${params.model} → ${params.stepId} = ${total}/25 (${stepScore.pass ? "PASS" : total >= FAIL_THRESHOLD ? "WATCH" : "FAIL"})`, {
    runId: params.runId,
    stepId: params.stepId,
  });

  return stepScore;
}

// ── Canary Kill Gate ─────────────────────────────────────────────────
// This is the only enforced rule during calibration.

/**
 * Check if a step score triggers canary kill (<15/25).
 * Only applies to Band 1 / first-stage steps.
 */
export function shouldKillCanary(score: StepScore, stepIndex: number): boolean {
  // Canary kill only applies to step_index 0 or 1 (Band 1 / Phase 1)
  if (stepIndex > 1) return false;
  return score.total < FAIL_THRESHOLD;
}
