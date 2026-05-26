-- Captured from /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db
-- Run: sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db ".schema"
-- Captured: 2026-05-24 (during v3.1 RFC review pass)
-- DB file size at capture: 14,946,304 bytes
-- DB mtime at capture: 2026-05-24 02:00:00
-- Raw sqlite3 .schema output: 167 lines of DDL
-- This file total (header + DDL): 176 lines per wc -l
-- Canonical MD5 hash for this artifact recorded in RFC-antfarm-v3.1.md §4 prereq #2 (avoids self-reference in the header)

CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    , notify_url TEXT, run_number INTEGER);
CREATE TABLE steps (
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
    , type TEXT NOT NULL DEFAULT 'single', loop_config TEXT, current_story_id TEXT, abandoned_count INTEGER DEFAULT 0, depends_on TEXT, escalated_model TEXT, timeout_minutes INTEGER, last_output_at TEXT, condition TEXT);
CREATE TABLE stories (
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
CREATE TABLE medic_checks (
      id TEXT PRIMARY KEY,
      checked_at TEXT NOT NULL,
      issues_found INTEGER DEFAULT 0,
      actions_taken INTEGER DEFAULT 0,
      summary TEXT,
      details TEXT
    );
CREATE TABLE agent_stats (
      agent_id TEXT PRIMARY KEY,
      total_runs INTEGER NOT NULL DEFAULT 0,
      retries INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      updated_at TEXT NOT NULL
    );
CREATE TABLE session_heartbeats (
      session_id TEXT PRIMARY KEY,
      step_id TEXT,
      run_id TEXT,
      last_ping_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'alive',
      created_at TEXT NOT NULL
    );
CREATE TABLE cron_idle_ticks (
      agent_id TEXT PRIMARY KEY,
      idle_ticks INTEGER NOT NULL DEFAULT 0,
      last_work_at TEXT,
      disabled_at TEXT,
      updated_at TEXT NOT NULL
    );
CREATE TABLE factory_items (
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
CREATE TABLE factory_runs (
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
CREATE TABLE factory_agent_runs (
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
CREATE TABLE factory_context_packs (
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
CREATE TABLE factory_artifacts (
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
CREATE TABLE factory_gates (
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
CREATE TABLE factory_events (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      actor TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
CREATE INDEX idx_factory_items_status ON factory_items(status, lifecycle_stage);
CREATE INDEX idx_factory_runs_item ON factory_runs(factory_item_id, status);
CREATE INDEX idx_factory_context_packs_item ON factory_context_packs(factory_item_id, stage, agent_role);
CREATE INDEX idx_factory_agent_runs_run ON factory_agent_runs(factory_run_id, status);
CREATE INDEX idx_factory_artifacts_item ON factory_artifacts(factory_item_id, artifact_type);
CREATE INDEX idx_factory_gates_item ON factory_gates(factory_item_id, gate_type);
CREATE INDEX idx_factory_events_item ON factory_events(factory_item_id, created_at);
