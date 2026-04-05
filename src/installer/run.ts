import crypto from "node:crypto";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { getDb, nextRunNumber } from "../db.js";
import { logger } from "../lib/logger.js";
import { ensureWorkflowCrons } from "./agent-cron.js";
import { emitEvent } from "./events.js";

function validateDependencyGraph(steps: Array<{ id: string; depends_on?: string | string[] }>): void {
  const stepIds = new Set(steps.map(s => s.id));

  for (const step of steps) {
    const rawDeps = (step as any).depends_on;
    const deps = typeof rawDeps === 'string' ? [rawDeps] : Array.isArray(rawDeps) ? rawDeps : [];

    for (const depId of deps) {
      if (!stepIds.has(depId)) {
        throw new Error(
          `Invalid dependency: step "${step.id}" depends on "${depId}" which does not exist. Available steps: ${[...stepIds].join(', ')}`
        );
      }
    }
  }

  const depsMap = new Map(steps.map(s => {
    const raw = (s as any).depends_on;
    return [s.id, typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []] as [string, string[]];
  }));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const dep of depsMap.get(id) || []) {
      if (hasCycle(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (hasCycle(step.id)) {
      throw new Error(`Circular dependency detected involving step "${step.id}"`);
    }
  }
}

export async function runWorkflow(params: {
  workflowId: string;
  taskTitle: string;
  notifyUrl?: string;
  repoPath?: string;
  scope?: string;
  focusAreas?: string;
  context?: Record<string, string>;
}): Promise<{ id: string; runNumber: number; workflowId: string; task: string; status: string }> {
  const workflowDir = resolveWorkflowDir(params.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const db = getDb();
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  const runNumber = nextRunNumber();

  const initialContext: Record<string, string> = {
    task: params.taskTitle,
    ...workflow.context,
    ...(params.repoPath && { repo_path: params.repoPath }),
    ...(params.scope && { scope: params.scope }),
    ...(params.focusAreas && { focus_areas: params.focusAreas }),
    ...params.context, // Bug #25 fix: merge --context KEY=value pairs into initialContext
  };

  db.exec("BEGIN");
  try {
    const notifyUrl = params.notifyUrl ?? workflow.notifications?.url ?? null;
    const insertRun = db.prepare(
      "INSERT INTO runs (id, run_number, workflow_id, task, status, context, notify_url, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)"
    );
    insertRun.run(runId, runNumber, workflow.id, params.taskTitle, JSON.stringify(initialContext), notifyUrl, now, now);

    const insertStep = db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, type, loop_config, depends_on, timeout_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    validateDependencyGraph(workflow.steps);

    // Cancel stale runs for this workflow — prevent claim competition (Bug #34)
    const staleRuns = db.prepare(
      "SELECT id FROM runs WHERE workflow_id = ? AND status = 'running' AND id != ?"
    ).all(workflow.id, runId) as Array<{ id: string }>;

    if (staleRuns.length > 0) {
      console.warn(`[antfarm] Cancelling ${staleRuns.length} stale run(s) for ${workflow.id}: ${staleRuns.map(r => r.id).join(', ')}`);

      const staleIds = staleRuns.map(r => r.id);
      db.prepare(`
        UPDATE steps SET status = 'cancelled', updated_at = ?
        WHERE run_id IN (${staleIds.map(() => '?').join(',')})
        AND status IN ('pending', 'waiting', 'running')
      `).run(now, ...staleIds);

      db.prepare(`
        UPDATE runs SET status = 'cancelled', updated_at = ?
        WHERE id IN (${staleIds.map(() => '?').join(',')})
      `).run(now, ...staleIds);
    }

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepUuid = crypto.randomUUID();
      const agentId = `${workflow.id}_${step.agent}`;
      // v4: Steps without depends_on start as 'pending' (parallel dispatch)
      // Steps WITH depends_on start as 'waiting' (gated by dependency resolution)
      // Normalize: depends_on can be a string or array in workflow.yml — treat both as array
      const rawDeps = (step as any).depends_on;
      const depsArray = typeof rawDeps === 'string' ? [rawDeps] : Array.isArray(rawDeps) ? rawDeps : [];
      const hasDeps = depsArray.length > 0;
      const status = hasDeps ? "waiting" : "pending";
      const depsJson = hasDeps ? JSON.stringify(depsArray) : null;
      const maxRetries = step.max_retries ?? step.on_fail?.max_retries ?? 2;
      const stepType = step.type ?? "single";
      const loopConfig = step.loop ? JSON.stringify(step.loop) : null;
      const timeoutMinutes = step.timeout_minutes ?? null;
      insertStep.run(stepUuid, runId, step.id, agentId, i, step.input, step.expects, status, maxRetries, stepType, loopConfig, depsJson, timeoutMinutes, now, now);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // Start crons for this workflow (no-op if already running from another run)
  try {
    await ensureWorkflowCrons(workflow);
  } catch (err) {
    // Roll back the run since it can't advance without crons
    const db2 = getDb();
    db2.prepare("UPDATE runs SET status = 'failed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot start workflow run: cron setup failed. ${message}`);
  }

  emitEvent({ ts: new Date().toISOString(), event: "run.started", runId, workflowId: workflow.id });

  logger.info(`Run started: "${params.taskTitle}"`, {
    workflowId: workflow.id,
    runId,
    stepId: workflow.steps[0]?.id,
  });

  return { id: runId, runNumber, workflowId: workflow.id, task: params.taskTitle, status: "running" };
}
