# ADP-411 migration evidence - 2026-05-25

## migrated copy
'schema_md5_expected'  '5dac653ec7a187f0faa7605e10835753'
---------------------  ----------------------------------
schema_md5_expected    5dac653ec7a187f0faa7605e10835753  
name                 
---------------------
agent_stats          
cron_idle_ticks      
factory_agent_runs   
factory_artifacts    
factory_context_packs
factory_events       
factory_gates        
factory_items        
factory_runs         
medic_checks         
runs                 
session_heartbeats   
steps                
stories              
name                      
--------------------------
factory_dashboard_sessions
factory_rtbf_requests     
factory_subject_registry  
factory_system_events     
factory_tenant_audit_log  
factory_tenant_compliance 
factory_tenants           
factory_vault_routes      
'runs_null_tenant_id'  COUNT(*)
---------------------  --------
runs_null_tenant_id    0       
'steps_null_tenant_id'  COUNT(*)
----------------------  --------
steps_null_tenant_id    0       
'stories_null_tenant_id'  COUNT(*)
------------------------  --------
stories_null_tenant_id    0       
'factory_items_null_tenant_id'  COUNT(*)
------------------------------  --------
factory_items_null_tenant_id    0       
'factory_runs_null_tenant_id'  COUNT(*)
-----------------------------  --------
factory_runs_null_tenant_id    0       
'factory_agent_runs_null_tenant_id'  COUNT(*)
-----------------------------------  --------
factory_agent_runs_null_tenant_id    0       
'factory_context_packs_null_tenant_id'  COUNT(*)
--------------------------------------  --------
factory_context_packs_null_tenant_id    0       
'factory_artifacts_null_tenant_id'  COUNT(*)
----------------------------------  --------
factory_artifacts_null_tenant_id    0       
'factory_gates_null_tenant_id'  COUNT(*)
------------------------------  --------
factory_gates_null_tenant_id    0       
'factory_events_null_tenant_id'  COUNT(*)
-------------------------------  --------
factory_events_null_tenant_id    0       
'system_events_misrouted_to_factory_events'  COUNT(*)
-------------------------------------------  --------
system_events_misrouted_to_factory_events    0       
'tenant_audit_email_literals'  COUNT(*)
-----------------------------  --------
tenant_audit_email_literals    0       
'factory_events_email_literals'  COUNT(*)
-------------------------------  --------
factory_events_email_literals    0       

## rollback copy tables
name                 
---------------------
factory_agent_runs   
factory_artifacts    
factory_context_packs
factory_events       
factory_gates        
factory_items        
factory_runs         
