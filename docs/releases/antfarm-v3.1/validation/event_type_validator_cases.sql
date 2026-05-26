-- Step 4b validator cases. Run inside a disposable SQLite copy.

INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_system_ok', 'runtime_started', NULL, 'system', '{}', datetime('now'));

-- Must fail: system_only with tenant_id.
INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_system_bad', 'runtime_started', 'flobase', 'system', '{}', datetime('now'));

-- Must fail: tenant_required without tenant_id.
INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_tenant_required_bad', 'approval_granted', NULL, 'day2_ops', '{}', datetime('now'));

INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_tenant_required_ok', 'approval_granted', 'flobase', 'day2_ops', '{}', datetime('now'));

-- Must fail: unknown event type.
INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_unknown_bad', 'surprise_event', NULL, 'system', '{}', datetime('now'));

-- Must fail: fresh legacy_unclassified insert.
INSERT INTO factory_system_events (id, event_type, tenant_id, actor, payload_json, created_at)
VALUES ('case_legacy_bad', 'legacy_unclassified', NULL, 'system', '{}', datetime('now'));
