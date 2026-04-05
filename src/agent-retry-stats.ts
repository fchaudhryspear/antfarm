// ── Issue #343: Agent Retry Stats (Prompt Tuning Framework) ──────────
// Tracks agent retry rates in SQLite for identifying prompts that need
// hardening. Extracted from step-ops.ts for standalone use.

import { getDb } from "./db.js";

export interface AgentStatRow {
  agent_id: string;
  total_runs: number;
  retries: number;
  retry_rate: number;
  last_run_at: string | null;
  flagged: boolean;
}

/** Retry rate threshold — agents above this are flagged for prompt tuning. */
const RETRY_RATE_THRESHOLD = 0.10; // 10%

/**
 * Record a successful step completion for an agent.
 */
export function recordAgentRun(agentId: string): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO agent_stats (agent_id, total_runs, retries, last_run_at, updated_at)
      VALUES (?, 1, 0, datetime('now'), datetime('now'))
      ON CONFLICT(agent_id) DO UPDATE SET
        total_runs = total_runs + 1,
        last_run_at = datetime('now'),
        updated_at = datetime('now')
    `).run(agentId);
  } catch { /* best-effort stats tracking */ }
}

/**
 * Record a retry event for an agent.
 */
export function recordAgentRetry(agentId: string): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO agent_stats (agent_id, total_runs, retries, last_run_at, updated_at)
      VALUES (?, 1, 1, datetime('now'), datetime('now'))
      ON CONFLICT(agent_id) DO UPDATE SET
        total_runs = total_runs + 1,
        retries = retries + 1,
        last_run_at = datetime('now'),
        updated_at = datetime('now')
    `).run(agentId);
  } catch { /* best-effort stats tracking */ }
}

/**
 * Get retry stats for all agents or a specific agent.
 * Returns agents sorted by retry rate descending.
 * Flags agents with >10% retry rate for prompt tuning.
 *
 * @param agentFilter - Optional substring filter for agent IDs
 */
export function getAgentStats(agentFilter?: string): AgentStatRow[] {
  const db = getDb();
  let rows: Array<{ agent_id: string; total_runs: number; retries: number; last_run_at: string | null }>;

  if (agentFilter) {
    rows = db.prepare(
      "SELECT agent_id, total_runs, retries, last_run_at FROM agent_stats WHERE agent_id LIKE ? ORDER BY CAST(retries AS REAL) / MAX(total_runs, 1) DESC"
    ).all(`%${agentFilter}%`) as typeof rows;
  } else {
    rows = db.prepare(
      "SELECT agent_id, total_runs, retries, last_run_at FROM agent_stats ORDER BY CAST(retries AS REAL) / MAX(total_runs, 1) DESC"
    ).all() as typeof rows;
  }

  return rows.map((r) => {
    const retryRate = r.total_runs > 0 ? r.retries / r.total_runs : 0;
    return {
      ...r,
      retry_rate: Math.round(retryRate * 1000) / 10, // percentage with 1 decimal
      flagged: retryRate > RETRY_RATE_THRESHOLD,
    };
  });
}
