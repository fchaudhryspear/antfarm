# ADP-429 Dashboard Aggregate Behavior

Date: 2026-06-05

## Route Contract

Dashboard factory routes require a trusted server-side dashboard session:

```http
Authorization: Bearer <dashboard-session-token>
```

The token is resolved against `factory_dashboard_sessions` by stored token hash. The resulting server-side session supplies `actorRole` and `authorizedTenants`.

The dashboard API does not treat query parameters as authorization facts. `actor_role` and `authorized_tenants` query parameters are ignored for authorization decisions.

Missing or invalid dashboard sessions fail closed:

```json
{
  "status": 401,
  "error": "dashboard_session_required"
}
```

Tenant dashboard reads are tenant-scoped by default, with tenant ID used only as a resource selector:

```http
GET /api/factory/dashboard?tenant_id=flobase
Authorization: Bearer <dashboard-session-token>
```

Missing tenant scope fails closed:

```json
{
  "status": 400,
  "error": "missing_tenant_scope"
}
```

Unauthorized tenant reads fail as not found to avoid tenant existence disclosure:

```json
{
  "status": 404,
  "error": "tenant_not_authorized"
}
```

Cross-tenant aggregate metadata is explicit and founder-only:

```http
GET /api/factory/dashboard?scope=aggregate
Authorization: Bearer <founder-dashboard-session-token>
```

Non-founder aggregate requests fail closed:

```json
{
  "status": 403,
  "error": "aggregate_scope_requires_founder"
}
```

Safe tenant metadata exposure is available separately:

```http
GET /api/factory/tenant-metadata?tenant_id=flobase
Authorization: Bearer <dashboard-session-token>
```

The tenant metadata route returns only:

```json
{
  "id": "flobase",
  "display_name": "Flobase",
  "compliance_class": "finance",
  "status": "active"
}
```

## Aggregate Safety

Founder aggregate responses expose counts and tenant registry metadata only. They intentionally omit per-item titles, timeline payloads, artifacts, context packs, gates, and event payloads.

Tenant-scoped dashboard responses include queue, active runs, item details, timeline, and active budget cap only for the requested authorized tenant.

## Verification

Commands:

```bash
npm ci
npm run build
node --test dist/server/dashboard.test.js
git diff --check
```

Results:

```text
tests 4
pass 4
fail 0
```

The targeted tests prove:

- forged `GET /api/factory/dashboard?scope=aggregate&actor_role=founder` without a trusted Bearer session returns `401 dashboard_session_required`
- forged `GET /api/factory/dashboard?tenant_id=credologi&actor_role=operator&authorized_tenants=credologi` without a trusted Bearer session returns `401 dashboard_session_required`
- forged `actor_role=founder&authorized_tenants=credologi` query params cannot expand a valid flobase operator session and return `404 tenant_not_authorized`
- missing tenant scope returns `400`
- unauthorized tenant read returns `404`
- non-founder aggregate returns `403`
- founder aggregate returns metadata only, with no `items` or `timeline`
- tenant reads filter items, timeline, active runs, and budget to the requested tenant

## Artifact References

- `src/server/dashboard.ts`
- `src/server/dashboard.test.ts`
- `src/server/index.html`
- `docs/releases/antfarm-v3.2/evidence/adp-429-dashboard-aggregate-behavior.md`
