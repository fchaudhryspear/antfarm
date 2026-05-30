# ADP-429 Dashboard Aggregate Behavior

Date: 2026-05-30

## Route Contract

Tenant dashboard reads are tenant-scoped by default:

```http
GET /api/factory/dashboard?tenant_id=flobase
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
GET /api/factory/dashboard?scope=aggregate&actor_role=founder
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
npm run build
node --test dist/server/dashboard.test.js
```

Results:

```text
tests 3
pass 3
fail 0
```

The targeted tests prove:

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
