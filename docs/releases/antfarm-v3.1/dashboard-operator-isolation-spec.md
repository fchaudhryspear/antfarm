# ADP-415 Dashboard Operator Isolation Spec

Owner: Leo for dashboard/operator behavior. Simon owns API/auth/query enforcement.

## Operator Behavior Contract

- Every dashboard session token carries `authorized_tenant_ids`.
- Every tenant-scoped dashboard read includes an explicit tenant scope.
- The tenant selector is built only from `authorized_tenant_ids`.
- The aggregate view is an explicit "all authorized tenants" mode, never a hidden all-tenant default.
- Day2 Ops scope is derived from `tenant_compliance.yaml` authority, not from UI role labels.
- Founder scope can include all six tenant slots; Day2 Ops scope includes only the tenants and actions granted by policy.

## Required Response Semantics

- Missing tenant scope on tenant-scoped read: `400` plus audit event.
- Unauthorized tenant read: `404` plus audit event, to avoid confirming existence.
- Unauthorized tenant mutation: `403` plus audit event.
- URL tenant and body `target_tenant_id` mismatch: `403` plus audit event.
- Run/artifact lookup for another tenant: `404` plus audit event.

## Audit Event Shape

Minimum fields:

- `event_type`: `dashboard_scope_denied`, `dashboard_scope_missing`, or `dashboard_scope_mismatch`
- `actor_id`
- `session_id`
- `requested_tenant_id`
- `authorized_tenant_ids_hash`
- `resource_type`
- `resource_id_hash`
- `decision`
- `http_status`
- `reason`
- `created_at`

The audit event must not include raw PII or raw subject identifiers.

## Mandatory Adversarial Tests

Simon handoff tests:

1. Day2 Ops token reading a Faisal-only tenant returns `404` and emits `dashboard_scope_denied`.
2. Day2 Ops token mutating an out-of-scope tenant returns `403` and emits `dashboard_scope_denied`.
3. URL tenant/body tenant mismatch returns `403` and emits `dashboard_scope_mismatch`.
4. URL manipulation for a run belonging to another tenant returns `404` and emits `dashboard_scope_denied`.
5. Endpoint without tenant scope returns `400` and emits `dashboard_scope_missing`.

Acceptance requires asserting both HTTP response and audit event existence. Frontend routing is never the security boundary.
