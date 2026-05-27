#!/usr/bin/env node
/**
 * Cron Recovery Hook
 * 
 * Re-registers agent crons for all active workflow runs.
 * Run this after gateway restarts to ensure crons survive.
 * 
 * Usage: antfarm cron-recovery [--dry-run]
 */

import { ensureWorkflowCrons } from '../installer/agent-cron.js';
import { loadWorkflowSpec } from '../installer/workflow-spec.js';
import { resolveWorkflowDir } from '../installer/paths.js';
import { listCronJobs } from '../installer/gateway-api.js';
import { getDb } from '../db.js';
import type { WorkflowSpec } from '../installer/types.js';

interface ActiveRun {
  id: string;
  workflow_id: string;
  status: string;
  task: string;
  updated_at: string;
}

type CronJob = { name: string };

interface RecoverCronsDeps {
  getActiveRuns?: () => ActiveRun[];
  resolveWorkflowDir?: (workflowId: string) => string;
  loadWorkflowSpec?: (workflowDir: string) => Promise<WorkflowSpec>;
  listCronJobs?: () => Promise<{ jobs?: CronJob[] }>;
  ensureWorkflowCrons?: (workflow: WorkflowSpec) => Promise<void>;
  log?: (message: string) => void;
}

function getActiveRuns(): ActiveRun[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, workflow_id, status, task, updated_at
    FROM runs
    WHERE status = 'running'
    ORDER BY updated_at DESC
  `).all() as unknown as ActiveRun[];
}

export async function recoverCrons(dryRun = false, deps: RecoverCronsDeps = {}): Promise<{
  workflows: string[];
  registered: number;
  alreadyPresent: number;
  errors: Array<{ workflow: string; error: string }>;
}> {
  const activeRuns = (deps.getActiveRuns ?? getActiveRuns)();
  const log = deps.log ?? console.log;
  
  // Group by workflow (multiple runs of same workflow = one ensure-crons call)
  const workflows = [...new Set(activeRuns.map(r => r.workflow_id))];
  
  const result = {
    workflows,
    registered: 0,
    alreadyPresent: 0,
    errors: [] as Array<{ workflow: string; error: string }>,
  };
  
  if (dryRun) {
    log('🔍 Dry run — no changes will be made\n');
    log(`Found ${activeRuns.length} active run(s) across ${workflows.length} workflow(s):\n`);
    for (const run of activeRuns) {
      log(`   #${run.id.slice(0, 8)}  ${run.workflow_id}  ${run.task.slice(0, 50)}...`);
    }
    log(`\nWould call ensure-crons for: ${workflows.join(', ')}`);
    return result;
  }
  
  log(`🔧 Recovering crons for ${workflows.length} workflow(s)...\n`);
  
  for (const workflowId of workflows) {
    try {
      const workflowDir = (deps.resolveWorkflowDir ?? resolveWorkflowDir)(workflowId);
      const workflow = await (deps.loadWorkflowSpec ?? loadWorkflowSpec)(workflowDir);
      const expectedCount = workflow.agents?.length || 0;

      // Check existing crons for logging context only — always call ensureWorkflowCrons
      // because it's idempotent and handles partial cron sets (e.g. 3 of 5 agents survived restart)
      const cronResult = await (deps.listCronJobs ?? listCronJobs)();
      const existingCrons = cronResult.jobs || [];
      const workflowCrons = existingCrons.filter((c: CronJob) => c.name?.startsWith(`antfarm/${workflowId}/`));
      const wasAlreadyPresent = workflowCrons.length === expectedCount;

      if (wasAlreadyPresent) {
        log(`   ⏭️  ${workflowId}: all ${expectedCount} cron(s) already present, reconciling...`);
        result.alreadyPresent++;
      } else {
        log(`   📝 ${workflowId}: ${workflowCrons.length}/${expectedCount} cron(s) present, reconciling...`);
      }

      // Always reconcile — ensureWorkflowCrons is idempotent and will create missing,
      // update drifted, and remove orphaned crons
      await (deps.ensureWorkflowCrons ?? ensureWorkflowCrons)(workflow);

      // Verify registration
      const afterResult = await (deps.listCronJobs ?? listCronJobs)();
      const afterCrons = afterResult.jobs || [];
      const afterWorkflowCrons = afterCrons.filter((c: CronJob) => c.name?.startsWith(`antfarm/${workflowId}/`));

      if (afterWorkflowCrons.length === expectedCount) {
        log(`   ✅ ${workflowId}: ${afterWorkflowCrons.length}/${expectedCount} cron(s) verified`);
        if (!wasAlreadyPresent) result.registered++;
      } else {
        log(`   ⚠️  ${workflowId}: ${afterWorkflowCrons.length}/${expectedCount} cron(s) after reconciliation`);
        if (!wasAlreadyPresent) result.registered++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`   ❌ ${workflowId}: ${msg}`);
      result.errors.push({ workflow: workflowId, error: msg });
    }
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  
  try {
    const result = await recoverCrons(dryRun);
    
    console.log('\n' + '='.repeat(50));
    console.log(`Summary: ${result.registered} registered, ${result.alreadyPresent} already present`);
    
    if (result.errors.length > 0) {
      console.log(`\n⚠️  ${result.errors.length} error(s):`);
      for (const { workflow, error } of result.errors) {
        console.log(`   ${workflow}: ${error}`);
      }
      process.exit(1);
    } else {
      console.log('✅ Cron recovery complete');
      process.exit(0);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Only run main if this is the entry point (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
