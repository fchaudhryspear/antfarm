-- Day2 Ops retention sweep reference query and tests.

-- Rows eligible for routine sweep.
SELECT id
FROM factory_tenant_audit_log
WHERE actor_class = 'operator'
  AND actor_role = 'day2_ops'
  AND created_at < datetime('now', '-90 days')
  AND event_type NOT IN ('incident_response_taken', 'incident_response_reversed')
  AND (event_chain_type IS NULL OR event_chain_type NOT IN ('incident_workflow', 'rtbf_workflow', 'compliance_audit_chain'));

-- Sweep summary/deletion events must be append-only writes to factory_system_events.
INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('retention_sweep_summary_example', 'retention_sweep_summary', NULL, 'system', '{"deleted":0}', datetime('now'));

INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('retention_sweep_deletion_example', 'retention_sweep_deletion', NULL, 'system', '{"tenant_counts":{}}', datetime('now'));

-- Required behavioral assertions for test harness.
-- 1. routine_fixes older than 90 days with NULL chain is swept.
-- 2. incident_response_taken older than 90 days survives.
-- 3. incident_response_reversed older than 90 days survives.
-- 4. routine_fixes with incident_workflow chain survives.
-- 5. routine_fixes with parent_action_id but NULL chain is swept.
-- 6. routine_fixes with rtbf_workflow chain survives.
-- 7. Faisal/founder rows survive.
-- 8. factory_system_events is never selected as a deletion source.
