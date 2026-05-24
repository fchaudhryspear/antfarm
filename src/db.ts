import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const DB_PATH = path.join(DB_DIR, "antfarm.db");

let _db: DatabaseSync | null = null;
let _dbOpenedAt = 0;
const DB_MAX_AGE_MS = 5000;

export function getDb(): DatabaseSync {
  const now = Date.now();
  if (_db && (now - _dbOpenedAt) < DB_MAX_AGE_MS) return _db;
  if (_db) { try { _db.close(); } catch {} }

  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _dbOpenedAt = now;
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
  migrateDb(_db);
  return _db;
}

export function migrateDb(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      step_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      story_index INTEGER NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      repo TEXT,
      issue_url TEXT,
      source TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'queued',
      lifecycle_stage TEXT NOT NULL DEFAULT 'intake',
      requested_by TEXT,
      owner TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_runs (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      workflow_id TEXT NOT NULL,
      antfarm_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      model_policy TEXT,
      budget_json TEXT,
      error_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_agent_runs (
      id TEXT PRIMARY KEY,
      factory_run_id TEXT NOT NULL REFERENCES factory_runs(id) ON DELETE CASCADE,
      context_pack_id TEXT,
      antfarm_step_id TEXT REFERENCES steps(id) ON DELETE SET NULL,
      agent_role TEXT NOT NULL,
      agent_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      workspace_path TEXT,
      branch_name TEXT,
      model TEXT,
      token_usage_json TEXT,
      cost_estimate REAL,
      started_at TEXT,
      completed_at TEXT,
      result_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_context_packs (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      stage TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      path TEXT NOT NULL,
      checksum TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_artifacts (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      agent_run_id TEXT REFERENCES factory_agent_runs(id) ON DELETE SET NULL,
      artifact_type TEXT NOT NULL,
      title TEXT NOT NULL,
      path_or_url TEXT NOT NULL,
      checksum TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_gates (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      gate_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      required INTEGER NOT NULL DEFAULT 1,
      evidence_url TEXT,
      checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_events (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      actor TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_factory_items_status ON factory_items(status, lifecycle_stage);
    CREATE INDEX IF NOT EXISTS idx_factory_runs_item ON factory_runs(factory_item_id, status);
    CREATE INDEX IF NOT EXISTS idx_factory_context_packs_item ON factory_context_packs(factory_item_id, stage, agent_role);
    CREATE INDEX IF NOT EXISTS idx_factory_agent_runs_run ON factory_agent_runs(factory_run_id, status);
    CREATE INDEX IF NOT EXISTS idx_factory_artifacts_item ON factory_artifacts(factory_item_id, artifact_type);
    CREATE INDEX IF NOT EXISTS idx_factory_gates_item ON factory_gates(factory_item_id, gate_type);
    CREATE INDEX IF NOT EXISTS idx_factory_events_item ON factory_events(factory_item_id, created_at);
  `);

  // Add columns to steps table for backwards compat
  const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("type")) {
    db.exec("ALTER TABLE steps ADD COLUMN type TEXT NOT NULL DEFAULT 'single'");
  }
  if (!colNames.has("loop_config")) {
    db.exec("ALTER TABLE steps ADD COLUMN loop_config TEXT");
  }
  if (!colNames.has("current_story_id")) {
    db.exec("ALTER TABLE steps ADD COLUMN current_story_id TEXT");
  }
  if (!colNames.has("abandoned_count")) {
    db.exec("ALTER TABLE steps ADD COLUMN abandoned_count INTEGER DEFAULT 0");
  }
  if (!colNames.has("escalated_model")) {
    db.exec("ALTER TABLE steps ADD COLUMN escalated_model TEXT");
  }
  // Issue #341: Per-step timeout in minutes (overrides role-based default)
  if (!colNames.has("timeout_minutes")) {
    db.exec("ALTER TABLE steps ADD COLUMN timeout_minutes INTEGER");
  }
  // Issue #342: Track last output timestamp for stale session detection
  if (!colNames.has("last_output_at")) {
    db.exec("ALTER TABLE steps ADD COLUMN last_output_at TEXT");
  }
  // Issue #344: Per-step condition for Tier skip logic
  if (!colNames.has("condition")) {
    db.exec("ALTER TABLE steps ADD COLUMN condition TEXT");
  }
  if (!colNames.has("depends_on")) {
    db.exec("ALTER TABLE steps ADD COLUMN depends_on TEXT");
  }

  const agentRunCols = db.prepare("PRAGMA table_info(factory_agent_runs)").all() as Array<{ name: string }>;
  const agentRunColNames = new Set(agentRunCols.map((c) => c.name));
  if (!agentRunColNames.has("context_pack_id")) {
    db.exec("ALTER TABLE factory_agent_runs ADD COLUMN context_pack_id TEXT");
  }

  // Issue #343: Agent retry stats table for prompt tuning framework
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_stats (
      agent_id TEXT PRIMARY KEY,
      total_runs INTEGER NOT NULL DEFAULT 0,
      retries INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  // Idle tick tracking for cron auto-disable
  // After MAX_IDLE_TICKS consecutive NO_WORK results, the cron is disabled.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_idle_ticks (
      agent_id TEXT PRIMARY KEY,
      idle_ticks INTEGER NOT NULL DEFAULT 0,
      last_work_at TEXT,
      disabled_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  // Add columns to runs table for backwards compat
  const runCols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  const runColNames = new Set(runCols.map((c) => c.name));
  if (!runColNames.has("notify_url")) {
    db.exec("ALTER TABLE runs ADD COLUMN notify_url TEXT");
  }
  if (!runColNames.has("run_number")) {
    db.exec("ALTER TABLE runs ADD COLUMN run_number INTEGER");
    // Backfill existing runs with sequential numbers based on creation order
    db.exec(`
      UPDATE runs SET run_number = (
        SELECT COUNT(*) FROM runs r2 WHERE r2.created_at <= runs.created_at
      ) WHERE run_number IS NULL
    `);
  }
}

export function nextRunNumber(): number {
  const db = getDb();
  const row = db.prepare("SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM runs").get() as { next: number };
  return row.next;
}

export function getDbPath(): string {
  return DB_PATH;
}
