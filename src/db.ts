import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const DB_PATH = path.join(DB_DIR, "antfarm.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
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

    CREATE TABLE IF NOT EXISTS obsidian_mirror_events (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      context_pack_id TEXT REFERENCES factory_context_packs(id) ON DELETE SET NULL,
      note_path TEXT NOT NULL,
      note_checksum TEXT NOT NULL,
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      redaction_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rollback_plans (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      environment TEXT NOT NULL,
      strategy TEXT NOT NULL,
      trigger_conditions_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      verification_json TEXT NOT NULL,
      approvers_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployment_events (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      rollback_plan_id TEXT REFERENCES rollback_plans(id) ON DELETE SET NULL,
      retry_of_deployment_event_id TEXT REFERENCES deployment_events(id) ON DELETE SET NULL,
      environment TEXT NOT NULL,
      commit_sha TEXT,
      version TEXT,
      status TEXT NOT NULL,
      side_effecting_action INTEGER NOT NULL DEFAULT 1,
      manual_approval_id TEXT,
      failure_cause TEXT,
      next_route TEXT NOT NULL,
      evidence_url TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smoke_test_runs (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      deployment_event_id TEXT REFERENCES deployment_events(id) ON DELETE SET NULL,
      suite_name TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_cause TEXT,
      next_route TEXT NOT NULL,
      evidence_url TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitoring_observations (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT NOT NULL REFERENCES factory_items(id) ON DELETE CASCADE,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      deployment_event_id TEXT REFERENCES deployment_events(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      window_minutes INTEGER NOT NULL DEFAULT 15,
      failure_cause TEXT,
      next_route TEXT NOT NULL,
      evidence_url TEXT,
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_audit_events (
      id TEXT PRIMARY KEY,
      factory_item_id TEXT REFERENCES factory_items(id) ON DELETE SET NULL,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      operator TEXT NOT NULL,
      command TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gateway_load_test_runs (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      baseline_concurrent_sessions INTEGER NOT NULL,
      target_concurrent_sessions INTEGER NOT NULL,
      sustained_seconds REAL NOT NULL,
      created_sessions INTEGER NOT NULL,
      heartbeat_count INTEGER NOT NULL,
      teardown_count INTEGER NOT NULL,
      connection_drops INTEGER NOT NULL,
      oom_detected INTEGER NOT NULL,
      heartbeat_timeout_passed INTEGER NOT NULL,
      launchagent_stability TEXT NOT NULL,
      max_parallel_units INTEGER NOT NULL,
      pass INTEGER NOT NULL,
      evidence_path TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_factory_items_status ON factory_items(status, lifecycle_stage);
    CREATE INDEX IF NOT EXISTS idx_factory_runs_item ON factory_runs(factory_item_id, status);
    CREATE INDEX IF NOT EXISTS idx_factory_context_packs_item ON factory_context_packs(factory_item_id, stage, agent_role);
    CREATE INDEX IF NOT EXISTS idx_factory_agent_runs_run ON factory_agent_runs(factory_run_id, status);
    CREATE INDEX IF NOT EXISTS idx_factory_artifacts_item ON factory_artifacts(factory_item_id, artifact_type);
    CREATE INDEX IF NOT EXISTS idx_factory_gates_item ON factory_gates(factory_item_id, gate_type);
    CREATE INDEX IF NOT EXISTS idx_factory_events_item ON factory_events(factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_obsidian_mirror_events_item ON obsidian_mirror_events(factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_rollback_plans_item ON rollback_plans(factory_item_id, environment, status);
    CREATE INDEX IF NOT EXISTS idx_deployment_events_item ON deployment_events(factory_item_id, environment, created_at);
    CREATE INDEX IF NOT EXISTS idx_smoke_test_runs_item ON smoke_test_runs(factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_monitoring_observations_item ON monitoring_observations(factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_dashboard_audit_events_target ON dashboard_audit_events(target_type, target_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_dashboard_audit_events_item ON dashboard_audit_events(factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_gateway_load_test_runs_issue ON gateway_load_test_runs(issue_id, created_at);
  `);

  migrateV31MultiTenant(db);

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

  migrateV31MultiTenant(db);
}

function columnNames(db: DatabaseSync, table: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(cols.map((c) => c.name));
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string): void {
  if (!columnNames(db, table).has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrateV31MultiTenant(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS factory_tenants (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      compliance_class TEXT NOT NULL CHECK (compliance_class IN ('default','finance','pii')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_tenant_compliance (
      tenant_id TEXT PRIMARY KEY REFERENCES factory_tenants(id),
      compliance_class TEXT NOT NULL,
      redaction_ruleset TEXT NOT NULL,
      retention_json TEXT NOT NULL DEFAULT '{}',
      approvers_json TEXT NOT NULL DEFAULT '{}',
      source_checksum TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_tenant_audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      event_type TEXT NOT NULL,
      event_chain_type TEXT CHECK (event_chain_type IS NULL OR event_chain_type IN ('incident_workflow','rtbf_workflow','compliance_audit_chain')),
      parent_action_id TEXT,
      actor TEXT,
      actor_role TEXT,
      actor_class TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      subject_id_hash TEXT,
      signature TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_vault_routes (
      tenant_id TEXT PRIMARY KEY REFERENCES factory_tenants(id),
      compliance_class TEXT NOT NULL,
      eligible_vaults_json TEXT NOT NULL,
      sensitive_required INTEGER NOT NULL DEFAULT 0,
      no_fallback INTEGER NOT NULL DEFAULT 1,
      source_checksum TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_rtbf_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES factory_tenants(id),
      subject_id_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('requested','reversible','finalized','canceled','blocked_legal_hold')),
      surfaces_json TEXT NOT NULL DEFAULT '{}',
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      reversible_at TEXT,
      finalized_at TEXT,
      deletion_proof_id TEXT
    );

    CREATE TABLE IF NOT EXISTS factory_subject_registry (
      tenant_id TEXT NOT NULL REFERENCES factory_tenants(id),
      subject_id_hash TEXT NOT NULL,
      envelope_key_id TEXT NOT NULL,
      rtbf_state TEXT NOT NULL DEFAULT 'active' CHECK (rtbf_state IN ('active','rtbf_requested','rtbf_reversible','rtbf_finalized')),
      rtbf_requested_at TEXT,
      rtbf_reversible_at TEXT,
      rtbf_finalized_at TEXT,
      legal_hold INTEGER NOT NULL DEFAULT 0,
      deletion_proof_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, subject_id_hash)
    );

    CREATE TABLE IF NOT EXISTS factory_dashboard_sessions (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      authorized_tenants_json TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS factory_system_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      tenant_id TEXT,
      actor TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_deployment_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES factory_tenants(id),
      factory_item_id TEXT REFERENCES factory_items(id) ON DELETE SET NULL,
      factory_run_id TEXT REFERENCES factory_runs(id) ON DELETE SET NULL,
      environment TEXT NOT NULL,
      service TEXT NOT NULL,
      version TEXT,
      status TEXT NOT NULL CHECK (status IN ('planned','started','succeeded','failed','rolled_back','manual_recorded')),
      actor TEXT,
      evidence_url TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factory_smoke_test_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES factory_tenants(id),
      deployment_event_id TEXT REFERENCES factory_deployment_events(id) ON DELETE SET NULL,
      suite TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped')),
      runner TEXT NOT NULL DEFAULT 'manual_stub',
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO factory_tenants (id, display_name, compliance_class, status, created_at, updated_at)
    VALUES
      ('v3_0_legacy', 'Pre-multi-tenant work', 'default', 'archived', datetime('now'), datetime('now')),
      ('utility_valet', 'Utility Valet', 'default', 'active', datetime('now'), datetime('now')),
      ('spearhead', 'Spearhead', 'default', 'active', datetime('now'), datetime('now')),
      ('flobase', 'Flobase', 'finance', 'active', datetime('now'), datetime('now')),
      ('credologi', 'Credologi', 'finance', 'active', datetime('now'), datetime('now')),
      ('fcrp_capital', 'FCRP Capital', 'default', 'active', datetime('now'), datetime('now')),
      ('starship_residential', 'Starship Residential', 'default', 'active', datetime('now'), datetime('now'));

    CREATE INDEX IF NOT EXISTS idx_factory_tenant_audit_log_tenant_time ON factory_tenant_audit_log(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_factory_system_events_type_time ON factory_system_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_factory_deployment_events_tenant_time ON factory_deployment_events(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_factory_smoke_test_runs_tenant_time ON factory_smoke_test_runs(tenant_id, completed_at);
  `);

  for (const table of ["runs", "steps", "stories", "factory_items", "factory_runs", "factory_agent_runs", "factory_context_packs", "factory_artifacts", "factory_gates", "factory_events"]) {
    addColumnIfMissing(db, table, "tenant_id", "TEXT");
  }
  addColumnIfMissing(db, "factory_context_packs", "redaction_ruleset_version", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_factory_items_tenant_status ON factory_items(tenant_id, status, lifecycle_stage);
    CREATE INDEX IF NOT EXISTS idx_factory_runs_tenant_item ON factory_runs(tenant_id, factory_item_id, status);
    CREATE INDEX IF NOT EXISTS idx_factory_events_tenant_item ON factory_events(tenant_id, factory_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_factory_context_packs_tenant_item ON factory_context_packs(tenant_id, factory_item_id, stage, agent_role);

    CREATE TRIGGER IF NOT EXISTS factory_events_reject_system_events
    BEFORE INSERT ON factory_events
    WHEN NEW.event_type IN ('runtime_started','runtime_stopped','config_reload','config_sync','retention_sweep_summary','retention_sweep_deletion','migration_checkpoint')
    BEGIN
      SELECT RAISE(ABORT, 'system event types must be written to factory_system_events, not factory_events');
    END;

    CREATE TRIGGER IF NOT EXISTS factory_system_events_tenant_check
    BEFORE INSERT ON factory_system_events
    BEGIN
      SELECT CASE
        WHEN NEW.event_type IN ('runtime_started','runtime_stopped','config_reload','config_sync','migration_checkpoint','retention_sweep_summary','retention_sweep_deletion')
          AND NEW.tenant_id IS NOT NULL
        THEN RAISE(ABORT, 'system_only event_type must not carry tenant_id')
        WHEN NEW.event_type IN ('approval_requested','approval_granted','approval_denied','incident_response_taken','incident_response_reversed','rtbf_state_transition')
          AND NEW.tenant_id IS NULL
        THEN RAISE(ABORT, 'tenant_required event_type requires tenant_id')
        WHEN NEW.event_type = 'legacy_unclassified'
        THEN RAISE(ABORT, 'legacy_unclassified is forbidden for fresh inserts')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS factory_tenant_audit_log_check
    BEFORE INSERT ON factory_tenant_audit_log
    BEGIN
      SELECT CASE
        WHEN NEW.event_type IN (
          'approval_requested','approval_granted','approval_denied',
          'incident_response_taken','incident_response_reversed',
          'rtbf_state_transition','notification_delete_attempt','routine_fixes'
        ) AND NEW.tenant_id IS NULL
        THEN RAISE(ABORT, 'tenant audit event_type requires tenant_id')
        WHEN NEW.event_type = 'rtbf_state_transition' AND NEW.event_chain_type IS NOT 'rtbf_workflow'
        THEN RAISE(ABORT, 'rtbf_state_transition requires rtbf_workflow chain')
        WHEN NEW.event_type IN ('incident_response_taken','incident_response_reversed') AND NEW.event_chain_type IS NOT 'incident_workflow'
        THEN RAISE(ABORT, 'incident response requires incident_workflow chain')
        WHEN NEW.event_type = 'legacy_unclassified'
        THEN RAISE(ABORT, 'legacy_unclassified is forbidden for fresh inserts')
        WHEN NEW.event_type NOT IN (
          'dashboard_scope_denied','notification_delete_attempt',
          'approval_requested','approval_granted','approval_denied',
          'incident_response_taken','incident_response_reversed',
          'rtbf_state_transition','routine_fixes'
        )
        THEN RAISE(ABORT, 'unknown tenant audit event_type denied by default')
        WHEN lower(NEW.payload_json) GLOB '*[a-z0-9._%+-]@[a-z0-9.-]*.[a-z][a-z]*'
          OR lower(NEW.payload_json) LIKE '%routing%'
          OR lower(NEW.payload_json) LIKE '%account%'
          OR lower(NEW.payload_json) GLOB '*[0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]*'
        THEN RAISE(ABORT, 'tenant audit payload contains raw PII')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS factory_events_reject_pii_payload
    BEFORE INSERT ON factory_events
    WHEN lower(NEW.payload_json) GLOB '*[a-z0-9._%+-]@[a-z0-9.-]*.[a-z][a-z]*'
      OR lower(NEW.payload_json) LIKE '%routing%'
      OR lower(NEW.payload_json) LIKE '%account%'
      OR lower(NEW.payload_json) GLOB '*[0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]*'
    BEGIN
      SELECT RAISE(ABORT, 'factory_events payload contains raw PII');
    END;
  `);
}

export function nextRunNumber(): number {
  const db = getDb();
  const row = db.prepare("SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM runs").get() as { next: number };
  return row.next;
}

export function getDbPath(): string {
  return DB_PATH;
}
