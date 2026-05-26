# Day2 Ops Interface and Activation Gate

## Phase A/B Interface Decision

Transport is a Linear comment workflow backed by the Antfarm audit ledger for v3.1.

Rationale:

- Linear already holds v3.1 project state and approver-visible work items.
- It does not require a live Day2 Ops platform for Phase B.
- It preserves a clean fallback-to-Faisal path until the Day2 Ops identity is real.
- The audit system remains authoritative; Linear comments are operator notification/decision UX, not the source of truth.

## Approval Request Shape

Every approval request carries:

- `request_id`
- `tenant_id`
- `action_type`
- `minimum_authority_class`
- `requested_approver_slot`
- `resolved_approver`
- `timeout_at`
- `evidence_url`
- `fallback_chain`

Approval comments must use one of:

- `APPROVE <request_id>`
- `DENY <request_id> <reason>`
- `ESCALATE <request_id> <reason>`

The runtime records the decision in `factory_tenant_audit_log`. Unknown or malformed comments do not authorize work.

## Pre-Live Resolution

`day2_ops` resolves to `faisal` for every tenant until all activation gates pass. This means Phase B can proceed while Day2 Ops remains pending.

## Activation Gate

Activation requires all of:

1. Day2 Ops platform reachable.
2. Linear-comment interface or replacement interface deployed.
3. At least one tenant has real Day2 Ops identity populated.
4. Successful Day2 Ops approval against a test workflow recorded in `factory_tenant_audit_log`.
5. Tenant isolation tests pass for Day2 Ops auth token.
6. 90-day routine Day2 Ops retention sweep is configured and tested.

## Retention Rule

Routine Day2 Ops audit rows older than 90 days are swept from `factory_tenant_audit_log` only when all sweep predicates match. The sweep must not read, filter, or delete from `factory_system_events`; it may append `retention_sweep_summary` and `retention_sweep_deletion` rows there.

Protected rows:

- Faisal/founder actions.
- `incident_response_taken`
- `incident_response_reversed`
- `event_chain_type` in `incident_workflow`, `rtbf_workflow`, `compliance_audit_chain`

## Security Rule

Changing retention days, excluded event types, preserving chain types, or Day2 Ops identity requires `security_changes` with founder authority. Timeout fallback cannot modify these settings.
