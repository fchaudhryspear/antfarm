import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli } from "./paths.js";
import { getDb } from "../db.js";
import { readOpenClawConfig } from "./openclaw-config.js";

const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => meta ? console.log(`[DEBUG] ${msg} ${JSON.stringify(meta)}`) : console.log(`[DEBUG] ${msg}`),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

const DEFAULT_EVERY_MS = 60_000; // 1 minute — v4 fix (was 300_000)

/**
 * Bug #23 fix: Check DB step status before claiming.
 * Prevents a cron from re-claiming a step that is already running/done.
 * The polling prompt (step 1) checks 'pending'/'waiting' (lightweight).
 * This function additionally checks 'running' (guards against race with abandoned-step reset).
 */
function buildStatusCheckPrompt(workflowId: string, agentId: string): string {
  const cli = resolveAntfarmCli();
  return `Verify step status before claiming in workflow "${workflowId}" agent "${agentId}".
Run this READ-ONLY check:
\`\`\`
node ${cli} step status "${workflowId}_${agentId}"
\`\`\`
If output contains "running" or "done", reply HEARTBEAT_OK and stop. Do NOT call step claim.`;
}
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

function buildAgentPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();

  return `You are an Antfarm workflow agent. Check for pending work and execute it.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

Step 1 — Check for pending work:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`

If output is "NO_WORK", reply HEARTBEAT_OK and stop.

Step 2 — If JSON is returned, it contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Step 3 — Do the work described in the input. Format your output with KEY: value lines as specified.

Step 4 — MANDATORY: Report completion (do this IMMEDIATELY after finishing the work).
Your output MUST start with SCORE: on the first line. Read your AGENTS.md for the required format.
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
SCORE: [your score]/100
FINDINGS: [number of findings]

[your findings here]
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node ${cli} step complete "<stepId>"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. If you're unsure whether to complete or fail, call step fail with an explanation

// Fix #3 (RCA 322-325): Session timeout hook — register emergency exit handler.
// If the session is killed (timeout, OOM, token limit), the shell will execute this on exit.
SESSION_TIMEOUT_HOOK=$(mktemp)
echo '#!/bin/bash' > "$SESSION_TIMEOUT_HOOK"
echo "node ${cli} step fail '<stepId>' 'Session timeout — no output produced'" >> "$SESSION_TIMEOUT_HOOK"
chmod +x "$SESSION_TIMEOUT_HOOK"
trap "bash $SESSION_TIMEOUT_HOOK; rm -f $SESSION_TIMEOUT_HOOK" EXIT

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

export function buildWorkPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();

  return `You are an Antfarm workflow agent. Execute the pending work below.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

The claimed step JSON is provided below. It contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Do the work described in the input. Format your output with KEY: value lines as specified.

MANDATORY: Report completion (do this IMMEDIATELY after finishing the work).
Your output MUST start with SCORE: on the first line. Read your AGENTS.md for the required format.
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
SCORE: [your score]/100
FINDINGS: [number of findings]

[your findings here]
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node ${cli} step complete "<stepId>"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. If you're unsure whether to complete or fail, call step fail with an explanation

// Fix #3 (RCA 322-325): Session timeout hook — register emergency exit handler.
// Parses stepId from the JSON you received, then sets a trap to auto-fail on session death.
SESSION_TIMEOUT_HOOK=$(mktemp)
STEP_ID=$(echo '<stepId>' | grep -oP '(?<=<)[^>]+(?=>)' || echo '<stepId>')
echo '#!/bin/bash' > "$SESSION_TIMEOUT_HOOK"
echo "node ${cli} step fail \"$STEP_ID\" 'Session timeout — no output produced'\"" >> "$SESSION_TIMEOUT_HOOK"
chmod +x "$SESSION_TIMEOUT_HOOK"
trap "bash $SESSION_TIMEOUT_HOOK; rm -f $SESSION_TIMEOUT_HOOK" EXIT

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

const DEFAULT_POLLING_TIMEOUT_SECONDS = 600; // 10 min — v4 fix for consolidate timeout (was 120)
const DEFAULT_POLLING_MODEL = "default";

function extractModel(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const primary = (value as { primary?: unknown }).primary;
    if (typeof primary === "string") return primary;
  }
  return undefined;
}

async function resolveAgentCronModel(agentId: string, requestedModel?: string): Promise<string | undefined> {
  if (requestedModel && requestedModel !== "default") {
    return requestedModel;
  }

  try {
    const { config } = await readOpenClawConfig();
    const agents = config.agents?.list;
    if (Array.isArray(agents)) {
      const entry = agents.find((a: any) => a?.id === agentId);
      const configured = extractModel(entry?.model);
      if (configured) return configured;
    }

    const defaults = config.agents?.defaults;
    const fallback = extractModel(defaults?.model);
    if (fallback) return fallback;
  } catch {
    // best-effort — fallback below
  }

  return requestedModel;
}

export function buildPollingPrompt(workflowId: string, agentId: string, workModel?: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();
  const model = workModel ?? "default";
  const workPrompt = buildWorkPrompt(workflowId, agentId);

  return `Step 1 — Quick check for pending work (lightweight, no side effects):
\`\`\`
node ${cli} step peek "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.

Step 2 — Claim the step ONLY if peek returned HAS_WORK:
\`\`\`
node ${cli} step status "${fullAgentId}"
\`\`\`
If output is "running", reply HEARTBEAT_OK and stop. Do NOT call step claim. This prevents double-claiming when two cron ticks fire simultaneously.
If output is "none", proceed to Step 3.

Step 3 — If status check returned "none", claim the step:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop.

If JSON is returned, parse it to extract stepId, runId, and input fields.
Then call sessions_spawn with these parameters:
- agentId: "${fullAgentId}"
- model: "${model}"
- task: The full work prompt below, followed by "\\n\\nCLAIMED STEP JSON:\\n" and the exact JSON output from step claim.

Full work prompt to include in the spawned task:
---START WORK PROMPT---
${workPrompt}
---END WORK PROMPT---

Reply with a short summary of what you spawned.`;
}

export async function setupAgentCrons(workflow: WorkflowSpec): Promise<void> {
  const agents = workflow.agents;
  // Allow per-workflow cron interval via cron.interval_ms in workflow.yml
  const everyMs = (workflow as any).cron?.interval_ms ?? DEFAULT_EVERY_MS;

  // Resolve polling model: per-agent > workflow-level > default
  const workflowPollingModel = workflow.polling?.model ?? DEFAULT_POLLING_MODEL;
  const workflowPollingTimeout = workflow.polling?.timeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const anchorMs = i * 60_000; // stagger by 1 minute each
    const cronName = `antfarm/${workflow.id}/${agent.id}`;
    const agentId = `${workflow.id}_${agent.id}`;

    // Two-phase: Phase 1 uses cheap polling model + minimal prompt
    const requestedPollingModel = agent.pollingModel ?? workflowPollingModel;
    const pollingModel = await resolveAgentCronModel(agentId, requestedPollingModel);
    const requestedWorkModel = agent.model ?? workflowPollingModel;
    const workModel = await resolveAgentCronModel(agentId, requestedWorkModel);
    const prompt = buildPollingPrompt(workflow.id, agent.id, workModel);
    const timeoutSeconds = workflowPollingTimeout;

    const result = await createAgentCronJob({
      name: cronName,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message: prompt, model: pollingModel, timeoutSeconds },
      delivery: { mode: "none" },
      enabled: true,
    });

    if (!result.ok) {
      throw new Error(`Failed to create cron job for agent "${agent.id}": ${result.error}`);
    }
  }
}

export async function removeAgentCrons(workflowId: string): Promise<void> {
  await deleteAgentCronJobs(`antfarm/${workflowId}/`);
}

// ── Run-scoped cron lifecycle ───────────────────────────────────────

/**
 * Count active (running) runs for a given workflow.
 */
function countActiveRuns(workflowId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM runs WHERE workflow_id = ? AND status = 'running'"
  ).get(workflowId) as { cnt: number };
  return row.cnt;
}

/**
 * Get existing cron jobs for a workflow as a Map of cronName → job.
 * Used for both existence checking and model reconciliation.
 */
async function getExistingWorkflowCronJobs(workflowId: string): Promise<Map<string, any>> {
  const result = await listCronJobs();
  if (!result.ok || !result.jobs) return new Map();
  const prefix = `antfarm/${workflowId}/`;
  const map = new Map<string, any>();
  for (const job of result.jobs) {
    if (job.name.startsWith(prefix)) {
      map.set(job.name, job);
    }
  }
  return map;
}

/**
 * Start crons for a workflow when a run begins.
 * v5: Full reconciliation — missing crons get created, stale crons get updated.
 * Detects model drift by comparing cron model vs workflow polling model.
 */
export async function ensureWorkflowCrons(workflow: WorkflowSpec): Promise<void> {
  const existingCrons = await getExistingWorkflowCronJobs(workflow.id);
  const agents = workflow.agents;
  const everyMs = (workflow as any).cron?.interval_ms ?? DEFAULT_EVERY_MS;
  const workflowPollingModel = workflow.polling?.model ?? DEFAULT_POLLING_MODEL;
  const workflowPollingTimeout = workflow.polling?.timeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;

  // Preflight: verify cron tool is accessible before attempting to create/update jobs.
  // Retry up to 3 times with backoff to handle post-restart gateway instability where
  // /health passes but the cron tool isn't yet initialized.
  let preflight: { ok: boolean; error?: string } = { ok: false, error: "preflight not attempted" };
  for (let attempt = 0; attempt < 3; attempt++) {
    preflight = await checkCronToolAvailable();
    if (preflight.ok) break;
    if (attempt < 2) {
      log.debug(`Cron preflight attempt ${attempt + 1} failed for "${workflow.id}", retrying in ${(attempt + 1) * 2}s...`);
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  if (!preflight.ok) {
    log.debug(`Cron preflight failed for "${workflow.id}" after 3 attempts: ${preflight.error}`);
    throw new Error(preflight.error!);
  }
  log.debug(`Cron preflight OK for "${workflow.id}", processing ${agents.length} agents`);

  // Bug #N fix: Delete crons for agents that no longer exist in the workflow spec.
  // Without this, reinstalling a workflow with fewer agents leaves orphaned crons firing.
  const agentIds = new Set(agents.map(a => `antfarm/${workflow.id}/${a.id}`));
  for (const [cronName] of existingCrons) {
    if (!agentIds.has(cronName)) {
      log.debug(`Removing orphaned cron: ${cronName}`);
      await deleteAgentCronJobs(cronName);
    }
  }

  for (const agent of agents) {
    const cronName = `antfarm/${workflow.id}/${agent.id}`;
    const agentId = `${workflow.id}_${agent.id}`;
    const existing = existingCrons.get(cronName);
    log.debug(`[${agent.id}] existing=${!!existing} cronName=${cronName}`);
    const requestedPollingModel = agent.pollingModel ?? workflowPollingModel;
    const pollingModel = await resolveAgentCronModel(agentId, requestedPollingModel);
    const requestedWorkModel = agent.model ?? workflowPollingModel;
    const workModel = await resolveAgentCronModel(agentId, requestedWorkModel);
    const prompt = buildPollingPrompt(workflow.id, agent.id, workModel);
    const timeoutSeconds = workflowPollingTimeout;
    const agentIndex = agents.indexOf(agent);
    const anchorMs = agentIndex * 60_000;

    if (!existing) {
      // Missing — create it
      const result = await createAgentCronJob({
        name: cronName,
        schedule: { kind: "every", everyMs, anchorMs },
        sessionTarget: "isolated",
        agentId,
        payload: { kind: "agentTurn", message: prompt, model: pollingModel, timeoutSeconds },
        delivery: { mode: "none" },
        enabled: true,
      });
      if (!result.ok) {
        throw new Error(`Failed to create cron job for agent "${agent.id}": ${result.error}`);
      }
      log.debug(`Created missing cron for agent "${agent.id}"`, { workflowId: workflow.id, cronName });
    } else {
      // Exists — check for model OR delivery drift
      const cronModel = existing.payload?.model ?? workflowPollingModel;
      const cronDelivery = existing.delivery?.mode ?? "announce";
      const needsRecreate = cronModel !== pollingModel || cronDelivery !== "none";
      if (needsRecreate) {
        // Model drift — delete and recreate with correct model
        log.debug(`Drift detected for "${agent.id}": model=${cronModel}->${pollingModel} delivery=${cronDelivery}->none.`, { workflowId: workflow.id, cronName });
        await deleteAgentCronJobs(cronName);
        const result = await createAgentCronJob({
          name: cronName,
          schedule: { kind: "every", everyMs, anchorMs },
          sessionTarget: "isolated",
          agentId,
          payload: { kind: "agentTurn", message: prompt, model: pollingModel, timeoutSeconds },
          delivery: { mode: "none" },
          enabled: true,
        });
        if (!result.ok) {
          throw new Error(`Failed to recreate cron job for agent "${agent.id}": ${result.error}`);
        }
        log.debug(`Recreated stale cron for agent "${agent.id}"`, { workflowId: workflow.id, cronName });
      }
    }
  }
}

/**
 * Tear down crons for a workflow when a run ends.
 * Only removes if NO active runs exist across ANY workflow (not just this one).
 * This prevents tearing down crons that other active runs depend on.
 */
export async function teardownWorkflowCronsIfIdle(workflowId: string): Promise<void> {
  const db = getDb();
  
  // Check ALL active runs across ALL workflows, not just this workflow
  const activeRuns = db.prepare(
    "SELECT COUNT(*) as count FROM runs WHERE status = 'running'"
  ).get() as { count: number } | undefined;
  
  const activeCount = activeRuns?.count ?? 0;
  
  if (activeCount > 0) {
    log.debug(`Skipping cron teardown — ${activeCount} active run(s) across all workflows`);
    return; // Don't touch crons while ANYTHING is running
  }
  
  // Safe to teardown — no active runs anywhere
  log.debug(`No active runs — tearing down crons for workflow ${workflowId}`);
  await removeAgentCrons(workflowId);
}
