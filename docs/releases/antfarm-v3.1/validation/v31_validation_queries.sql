-- Antfarm v3.1 validation and expected evidence queries.

-- Snapshot identity.
SELECT 'schema_md5_expected', '5dac653ec7a187f0faa7605e10835753';

-- Existing table coverage: expected 14 existing tables from the schema snapshot.
SELECT name FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'runs','steps','stories','medic_checks','agent_stats','session_heartbeats','cron_idle_ticks',
    'factory_items','factory_runs','factory_agent_runs','factory_context_packs','factory_artifacts','factory_gates','factory_events'
  )
ORDER BY name;

-- Net-new v3.1 table coverage: expected 8 rows.
SELECT name FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'factory_tenants','factory_tenant_compliance','factory_tenant_audit_log','factory_vault_routes',
    'factory_rtbf_requests','factory_subject_registry','factory_dashboard_sessions','factory_system_events'
  )
ORDER BY name;

-- Tenant-scoped NULL checks: all expected 0 after backfill.
SELECT 'runs_null_tenant_id', COUNT(*) FROM runs WHERE tenant_id IS NULL;
SELECT 'steps_null_tenant_id', COUNT(*) FROM steps WHERE tenant_id IS NULL;
SELECT 'stories_null_tenant_id', COUNT(*) FROM stories WHERE tenant_id IS NULL;
SELECT 'factory_items_null_tenant_id', COUNT(*) FROM factory_items WHERE tenant_id IS NULL;
SELECT 'factory_runs_null_tenant_id', COUNT(*) FROM factory_runs WHERE tenant_id IS NULL;
SELECT 'factory_agent_runs_null_tenant_id', COUNT(*) FROM factory_agent_runs WHERE tenant_id IS NULL;
SELECT 'factory_context_packs_null_tenant_id', COUNT(*) FROM factory_context_packs WHERE tenant_id IS NULL;
SELECT 'factory_artifacts_null_tenant_id', COUNT(*) FROM factory_artifacts WHERE tenant_id IS NULL;
SELECT 'factory_gates_null_tenant_id', COUNT(*) FROM factory_gates WHERE tenant_id IS NULL;
SELECT 'factory_events_null_tenant_id', COUNT(*) FROM factory_events WHERE tenant_id IS NULL;

-- System event routing: expected 0 forever.
SELECT 'system_events_misrouted_to_factory_events', COUNT(*)
FROM factory_events
WHERE event_type IN ('runtime_started','runtime_stopped','config_reload','config_sync','retention_sweep_summary','retention_sweep_deletion','migration_checkpoint');

-- RTBF/audit PII validator smoke targets: expected 0 literal PII patterns.
SELECT 'tenant_audit_email_literals', COUNT(*)
FROM factory_tenant_audit_log
WHERE payload_json GLOB '*@*.*';

SELECT 'factory_events_email_literals', COUNT(*)
FROM factory_events
WHERE payload_json GLOB '*@*.*';
