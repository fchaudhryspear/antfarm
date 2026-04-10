#!/usr/bin/env node
/**
 * Cron Recovery Hook
 * 
 * Re-registers agent crons for all active workflow runs.
 * Run this after gateway restarts to ensure crons survive.
 * 
 * Usage: antfarm cron-recovery [--dry-run]
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { ensureWorkflowCrons } from '../installer/agent-cron.js';
import { loadWorkflowSpec } from '../installer/workflow-spec.js';
import { resolveWorkflowDir } from '../installer/paths.js';
import { listCronJobs } from '../installer/gateway-api.js';

interface ActiveRun {
  id: string;
  workflow_id: string;
  status: string;
  task: string;
  updated_at: string;
}

function getActiveRuns(): ActiveRun[] {
  const dbPath = path.join(os.homedir(), '.openclaw', 'antfarm', 'antfarm.db');
  const output = execSync(`sqlite3 -separator $'\t' "${dbPath}" "SELECT id, workflow_id, status, COALESCE(REPLACE(task, char(10), ' '), ''), COALESCE(updated_at, '') FROM runs WHERE status = 'running' ORDER BY updated_at DESC;"`, {
    encoding: 'utf-8'
  });
  
  if (!output.trim()) return [];
  
  return output.trim().split('\n').map(line => {
    const [id = '', workflow_id = '', status = '', task = '', updated_at = ''] = line.split('\t');
    return { id, workflow_id, status, task, updated_at };
  });
}

export async function recoverCrons(dryRun = false): Promise<{
  workflows: string[];
  registered: number;
  alreadyPresent: number;
  errors: Array<{ workflow: string; error: string }>;
}> {
  const activeRuns = getActiveRuns();
  
  // Group by workflow (multiple runs of same workflow = one ensure-crons call)
  const workflows = [...new Set(activeRuns.map(r => r.workflow_id))];
  
  const result = {
    workflows,
    registered: 0,
    alreadyPresent: 0,
    errors: [] as Array<{ workflow: string; error: string }>,
  };
  
  if (dryRun) {
    console.log('🔍 Dry run — no changes will be made\n');
    console.log(`Found ${activeRuns.length} active run(s) across ${workflows.length} workflow(s):\n`);
    for (const run of activeRuns) {
      const shortId = (run.id || '').slice(0, 8) || 'unknown';
      const taskPreview = (run.task || '').slice(0, 50);
      console.log(`   #${shortId}  ${run.workflow_id || 'unknown'}  ${taskPreview}${run.task && run.task.length > 50 ? '...' : ''}`);
    }
    console.log(`\nWould call ensure-crons for: ${workflows.join(', ')}`);
    return result;
  }
  
  console.log(`🔧 Recovering crons for ${workflows.length} workflow(s)...\n`);
  
  for (const workflowId of workflows) {
    try {
      const workflowDir = resolveWorkflowDir(workflowId);
      const workflow = await loadWorkflowSpec(workflowDir);
      const expectedCount = workflow.agents?.length || 0;

      // Check existing crons for logging context only — always call ensureWorkflowCrons
      // because it's idempotent and handles partial cron sets (e.g. 3 of 5 agents survived restart)
      const cronResult = await listCronJobs();
      const existingCrons = cronResult.jobs || [];
      const workflowCrons = existingCrons.filter((c: { name: string }) => c.name?.startsWith(`antfarm/${workflowId}/`));

      if (workflowCrons.length === expectedCount) {
        console.log(`   ⏭️  ${workflowId}: all ${expectedCount} cron(s) already present, reconciling...`);
      } else {
        console.log(`   📝 ${workflowId}: ${workflowCrons.length}/${expectedCount} cron(s) present, reconciling...`);
      }

      // Always reconcile — ensureWorkflowCrons is idempotent and will create missing,
      // update drifted, and remove orphaned crons
      await ensureWorkflowCrons(workflow);

      // Verify registration
      const afterResult = await listCronJobs();
      const afterCrons = afterResult.jobs || [];
      const afterWorkflowCrons = afterCrons.filter((c: { name: string }) => c.name?.startsWith(`antfarm/${workflowId}/`));

      if (afterWorkflowCrons.length === expectedCount) {
        console.log(`   ✅ ${workflowId}: ${afterWorkflowCrons.length}/${expectedCount} cron(s) verified`);
        result.registered++;
      } else {
        console.log(`   ⚠️  ${workflowId}: ${afterWorkflowCrons.length}/${expectedCount} cron(s) after reconciliation`);
        result.registered++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ❌ ${workflowId}: ${msg}`);
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
