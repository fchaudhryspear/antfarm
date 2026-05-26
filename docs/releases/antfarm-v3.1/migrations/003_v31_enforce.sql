-- Antfarm v3.1 migration Step 4/4b enforcement.
-- SQLite requires table rebuilds to add NOT NULL/FK constraints to existing columns.
-- This packet provides the canonical enforcement target and must be applied per-table
-- after validation proves tenant_id has no NULLs in tenant_scoped tables.

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
    WHEN NEW.event_type NOT IN (
      'runtime_started','runtime_stopped','config_reload','config_sync','migration_checkpoint',
      'retention_sweep_summary','retention_sweep_deletion',
      'dashboard_session_created','dashboard_session_revoked','dashboard_scope_denied',
      'approval_requested','approval_granted','approval_denied',
      'incident_response_taken','incident_response_reversed','rtbf_state_transition'
    )
    THEN RAISE(ABORT, 'unknown event_type denied by default')
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

CREATE TRIGGER IF NOT EXISTS factory_tenant_compliance_no_direct_write
BEFORE UPDATE ON factory_tenant_compliance
WHEN COALESCE(NEW.source_checksum, '') = COALESCE(OLD.source_checksum, '')
BEGIN
  SELECT RAISE(ABORT, 'factory_tenant_compliance is a derived mirror; update source YAML and resync');
END;

CREATE TRIGGER IF NOT EXISTS factory_vault_routes_no_direct_write
BEFORE UPDATE ON factory_vault_routes
WHEN COALESCE(NEW.source_checksum, '') = COALESCE(OLD.source_checksum, '')
BEGIN
  SELECT RAISE(ABORT, 'factory_vault_routes is a derived mirror; update source YAML and resync');
END;
