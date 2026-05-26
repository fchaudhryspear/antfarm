-- Antfarm v3.1 migration Step 1: expand.
-- Safe for populated SQLite tables: every added column is nullable or has a constant DEFAULT.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

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

ALTER TABLE runs ADD COLUMN tenant_id TEXT;
ALTER TABLE steps ADD COLUMN tenant_id TEXT;
ALTER TABLE stories ADD COLUMN tenant_id TEXT;
ALTER TABLE medic_checks ADD COLUMN tenant_id TEXT;
ALTER TABLE session_heartbeats ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_items ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_runs ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_agent_runs ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_context_packs ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_artifacts ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_gates ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_events ADD COLUMN tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_factory_tenant_audit_log_tenant_time ON factory_tenant_audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_factory_tenant_audit_log_retention ON factory_tenant_audit_log(actor_class, actor_role, event_type, event_chain_type, created_at);
CREATE INDEX IF NOT EXISTS idx_factory_system_events_type_time ON factory_system_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_factory_rtbf_requests_tenant_subject ON factory_rtbf_requests(tenant_id, subject_id_hash);

COMMIT;
PRAGMA foreign_keys = ON;
