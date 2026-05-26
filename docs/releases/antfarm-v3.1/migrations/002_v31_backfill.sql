-- Antfarm v3.1 migration Step 2: backfill.
-- Run after 001_v31_expand.sql. Each execution must capture row counts before and after.
BEGIN TRANSACTION;

INSERT OR IGNORE INTO factory_tenants (id, display_name, compliance_class, status, created_at, updated_at)
VALUES
  ('v3_0_legacy', 'Pre-multi-tenant work', 'default', 'archived', datetime('now'), datetime('now')),
  ('flobase', 'Flobase', 'finance', 'active', datetime('now'), datetime('now')),
  ('credologi', 'Credologi', 'finance', 'active', datetime('now'), datetime('now')),
  ('utility_valet', 'Utility Valet', 'default', 'active', datetime('now'), datetime('now')),
  ('spearhead', 'Spearhead', 'default', 'active', datetime('now'), datetime('now')),
  ('fcrp_capital', 'FCRP Capital', 'default', 'active', datetime('now'), datetime('now')),
  ('starship_residential', 'Starship Residential', 'default', 'active', datetime('now'), datetime('now'));

UPDATE runs SET tenant_id = 'v3_0_legacy' WHERE tenant_id IS NULL;
UPDATE steps SET tenant_id = COALESCE((SELECT tenant_id FROM runs WHERE runs.id = steps.run_id), 'v3_0_legacy') WHERE tenant_id IS NULL;
UPDATE stories SET tenant_id = COALESCE((SELECT tenant_id FROM runs WHERE runs.id = stories.run_id), 'v3_0_legacy') WHERE tenant_id IS NULL;
UPDATE medic_checks SET tenant_id = NULL WHERE tenant_id IS NULL;
UPDATE session_heartbeats SET tenant_id = NULL WHERE tenant_id IS NULL;

UPDATE factory_items SET tenant_id = 'v3_0_legacy' WHERE tenant_id IS NULL;
UPDATE factory_runs
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_items WHERE factory_items.id = factory_runs.factory_item_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;
UPDATE factory_agent_runs
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_runs WHERE factory_runs.id = factory_agent_runs.factory_run_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;
UPDATE factory_context_packs
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_items WHERE factory_items.id = factory_context_packs.factory_item_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;
UPDATE factory_artifacts
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_items WHERE factory_items.id = factory_artifacts.factory_item_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;
UPDATE factory_gates
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_items WHERE factory_items.id = factory_gates.factory_item_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;
UPDATE factory_events
SET tenant_id = COALESCE((SELECT tenant_id FROM factory_items WHERE factory_items.id = factory_events.factory_item_id), 'v3_0_legacy')
WHERE tenant_id IS NULL;

COMMIT;
