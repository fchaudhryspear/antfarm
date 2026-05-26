# ADP-410/417/418 controlled runtime evidence - 2026-05-25

- factory_item_id: adp410_item_1779706914585
- factory_run_id: adp410_run_1779706914585
- factory_agent_run_id: adp417_agent_1779706914585
- context_pack_id: adp417_pack_1779706914585
- artifact_id: adp417_artifact_1779706914585
- gate_id: adp417_gate_1779706914585
- event_id: adp410_event_1779706914585
- deployment_event_id: 9f6da463-b8b0-464d-99dc-0dc41f2991ef
- smoke_test_run_id: d2fc02c4-393c-4069-bffb-a2f7a246b6bc
- dashboard_session_id: 8f9e3c97-091d-4d48-bb23-524344fa6305
- context_pack_path: /Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/evidence/context-packs/adp410_item_1779706914585/execution/backend_runtime/d0d2599de96208ab
- context_pack_checksum: d0d2599de96208aba8b8ece01934f5af78d28dfe3849103eadcf785667b1ff2a

Runtime model: explicit invocation path via Antfarm DB/runtime API. System/runtime events are routed to factory_system_events; tenant work events remain in factory_events.

Day2 Ops is not fully activated; production-touching finance approval path recorded as fallback-to-Faisal/founder authority.

## SQL evidence

```sql
SELECT * FROM factory_items WHERE id = adp410_item_1779706914585;
SELECT * FROM factory_runs WHERE id = adp410_run_1779706914585;
SELECT * FROM factory_agent_runs WHERE factory_run_id = adp410_run_1779706914585;
SELECT id, tenant_id, redaction_ruleset_version, checksum FROM factory_context_packs WHERE factory_run_id = adp410_run_1779706914585;
SELECT id, tenant_id, gate_type, status FROM factory_gates WHERE factory_run_id = adp410_run_1779706914585;
SELECT id, tenant_id, event_type, actor FROM factory_events WHERE factory_run_id = adp410_run_1779706914585;
SELECT id, event_type, tenant_id, actor FROM factory_system_events WHERE event_type = runtime_started ORDER BY created_at DESC LIMIT 3;
SELECT id, tenant_id, status, service FROM factory_deployment_events WHERE factory_run_id = adp410_run_1779706914585;
SELECT id, tenant_id, status, runner FROM factory_smoke_test_runs ORDER BY completed_at DESC LIMIT 3;
```

```text
id                         tenant_id  status  lifecycle_stage  title                                
-------------------------  ---------  ------  ---------------  -------------------------------------
adp410_item_1779706914585  flobase    done    completed        Controlled Flobase v3.1 runtime proof
id                        tenant_id  factory_item_id            workflow_id                            status     started_at                completed_at            
------------------------  ---------  -------------------------  -------------------------------------  ---------  ------------------------  ------------------------
adp410_run_1779706914585  flobase    adp410_item_1779706914585  antfarm-v3.1-controlled-flobase-proof  completed  2026-05-25T11:01:54.584Z  2026-05-25T11:01:54.584Z
id                          tenant_id  factory_run_id            agent_role       status     model                  
--------------------------  ---------  ------------------------  ---------------  ---------  -----------------------
adp417_agent_1779706914585  flobase    adp410_run_1779706914585  backend_runtime  completed  local/qwen2.5-coder:32b
id                         tenant_id  redaction_ruleset_version  checksum                                                        
-------------------------  ---------  -------------------------  ----------------------------------------------------------------
adp417_pack_1779706914585  flobase    finance_v1                 d0d2599de96208aba8b8ece01934f5af78d28dfe3849103eadcf785667b1ff2a
id                         tenant_id  gate_type                 status
-------------------------  ---------  ------------------------  ------
adp417_gate_1779706914585  flobase    finance_founder_approval  passed
id                          tenant_id  event_type                         actor
--------------------------  ---------  ---------------------------------  -----
adp410_event_1779706914585  flobase    workflow.controlled_runtime_proof  Simon
id                           event_type       tenant_id  actor
---------------------------  ---------------  ---------  -----
adp410_system_1779706914593  runtime_started             Simon
id                                    tenant_id  status           service          
------------------------------------  ---------  ---------------  -----------------
9f6da463-b8b0-464d-99dc-0dc41f2991ef  flobase    manual_recorded  flobase-prototype
id                                    tenant_id  status  runner     
------------------------------------  ---------  ------  -----------
d2fc02c4-393c-4069-bffb-a2f7a246b6bc  flobase    passed  manual_stub
event_type                   n
---------------------------  -
dashboard_scope_denied       2
notification_delete_attempt  1
```
