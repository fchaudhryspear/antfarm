-- Antfarm v3.1 rollback helpers.
-- Use only for a controlled rollback window after preserving DB backup evidence.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

DROP TRIGGER IF EXISTS factory_events_reject_system_events;
DROP TRIGGER IF EXISTS factory_system_events_tenant_check;
DROP TRIGGER IF EXISTS factory_tenant_compliance_no_direct_write;
DROP TRIGGER IF EXISTS factory_vault_routes_no_direct_write;

DROP TABLE IF EXISTS factory_dashboard_sessions;
DROP TABLE IF EXISTS factory_rtbf_requests;
DROP TABLE IF EXISTS factory_subject_registry;
DROP TABLE IF EXISTS factory_vault_routes;
DROP TABLE IF EXISTS factory_tenant_audit_log;
DROP TABLE IF EXISTS factory_tenant_compliance;
DROP TABLE IF EXISTS factory_system_events;
DROP TABLE IF EXISTS factory_tenants;

-- SQLite 3.35+ supports DROP COLUMN. If unavailable, rebuild each table from
-- antfarm-schema-snapshot-2026-05-24.sql and restore from backup.
ALTER TABLE runs DROP COLUMN tenant_id;
ALTER TABLE steps DROP COLUMN tenant_id;
ALTER TABLE stories DROP COLUMN tenant_id;
ALTER TABLE medic_checks DROP COLUMN tenant_id;
ALTER TABLE session_heartbeats DROP COLUMN tenant_id;
ALTER TABLE factory_items DROP COLUMN tenant_id;
ALTER TABLE factory_runs DROP COLUMN tenant_id;
ALTER TABLE factory_agent_runs DROP COLUMN tenant_id;
ALTER TABLE factory_context_packs DROP COLUMN tenant_id;
ALTER TABLE factory_artifacts DROP COLUMN tenant_id;
ALTER TABLE factory_gates DROP COLUMN tenant_id;
ALTER TABLE factory_events DROP COLUMN tenant_id;

COMMIT;
PRAGMA foreign_keys = ON;
