/**
 * Session Heartbeat Monitoring (Issue #339)
 *
 * Tracks agent session liveness via periodic pings.
 * - ping(sessionId): called every 60s by agents to signal they're alive
 * - getStaleSessions(thresholdMs): returns sessions with no ping in threshold
 * - markDead(sessionId): flags a session as dead for re-enqueue
 */
import { getDb } from "./db.js";

// ── DB Migration ────────────────────────────────────────────────────

export function ensureHeartbeatTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_heartbeats (
      session_id TEXT PRIMARY KEY,
      step_id TEXT,
      run_id TEXT,
      last_ping_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'alive',
      created_at TEXT NOT NULL
    )
  `);
}

// ── Heartbeat API ───────────────────────────────────────────────────

/**
 * Record a heartbeat ping for a session.
 * Called every 60s by agents while they're working on a step.
 */
export function ping(sessionId: string, stepId?: string, runId?: string): void {
  ensureHeartbeatTable();
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare(
    "SELECT session_id FROM session_heartbeats WHERE session_id = ?"
  ).get(sessionId) as { session_id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE session_heartbeats SET last_ping_at = ?, status = 'alive', step_id = COALESCE(?, step_id), run_id = COALESCE(?, run_id) WHERE session_id = ?"
    ).run(now, stepId ?? null, runId ?? null, sessionId);
  } else {
    db.prepare(
      "INSERT INTO session_heartbeats (session_id, step_id, run_id, last_ping_at, status, created_at) VALUES (?, ?, ?, ?, 'alive', ?)"
    ).run(sessionId, stepId ?? null, runId ?? null, now, now);
  }
}

export interface StaleSession {
  sessionId: string;
  stepId: string | null;
  runId: string | null;
  lastPingAt: string;
  staleDurationMs: number;
}

/**
 * Find sessions that haven't pinged within the given threshold.
 * Only returns sessions still marked as 'alive' (not already flagged dead).
 */
export function getStaleSessions(thresholdMs: number): StaleSession[] {
  ensureHeartbeatTable();
  const db = getDb();

  const rows = db.prepare(`
    SELECT session_id, step_id, run_id, last_ping_at
    FROM session_heartbeats
    WHERE status = 'alive'
      AND (julianday('now') - julianday(last_ping_at)) * 86400000 > ?
  `).all(thresholdMs) as Array<{
    session_id: string;
    step_id: string | null;
    run_id: string | null;
    last_ping_at: string;
  }>;

  return rows.map(r => ({
    sessionId: r.session_id,
    stepId: r.step_id,
    runId: r.run_id,
    lastPingAt: r.last_ping_at,
    staleDurationMs: Date.now() - new Date(r.last_ping_at).getTime(),
  }));
}

/**
 * Mark a session as dead. The associated step will be re-enqueued
 * by the cron stale-session checker.
 */
export function markDead(sessionId: string): void {
  ensureHeartbeatTable();
  const db = getDb();

  db.prepare(
    "UPDATE session_heartbeats SET status = 'dead', last_ping_at = ? WHERE session_id = ?"
  ).run(new Date().toISOString(), sessionId);
}

/**
 * Remove heartbeat record when a session completes normally.
 */
export function clearSession(sessionId: string): void {
  ensureHeartbeatTable();
  const db = getDb();
  db.prepare("DELETE FROM session_heartbeats WHERE session_id = ?").run(sessionId);
}

/**
 * Prune old heartbeat records (dead or stale > 24h).
 */
export function pruneHeartbeats(): void {
  ensureHeartbeatTable();
  const db = getDb();
  db.prepare(
    "DELETE FROM session_heartbeats WHERE status = 'dead' OR (julianday('now') - julianday(last_ping_at)) * 86400000 > 86400000"
  ).run();
}
