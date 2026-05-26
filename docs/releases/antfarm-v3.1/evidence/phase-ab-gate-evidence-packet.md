# Phase A/B Gate Evidence Packet

Generated: 2026-05-25

## Phase A Prerequisites

| Gate | Status | Evidence |
| --- | --- | --- |
| v3.0 closure items resolved or carried forward | Evidence needed from Ross/Optimus | RFC predecessor notes referenced in `RFC-antfarm-v3.1.md`; owner decision still needed for final close/carry-forward list |
| Schema inventory verified against PR #11 | Complete | `antfarm-schema-snapshot-2026-05-24.sql`, MD5 `5dac653ec7a187f0faa7605e10835753` |
| Table classification agreed | Complete for Atlas packet | `schema_classification.yaml` |
| `tenant_compliance.yaml` schema agreed/red-teamable | Complete for Atlas packet | `tenant_compliance.yaml`, `tenant-compliance-template.yaml` |
| Day2 Ops interface design defined | Complete for Atlas packet | `day2-ops-interface-and-activation-gate.md`, `validation/day2_retention_sweep.sql` |
| Two-vault root setup planned/complete | Complete for policy; sync device IDs pending | `vault-routing-policy.md`, `factory-vault-routes.yaml`, `vault-routing-verification.md` |
| Antfarm runtime activation evidence path linked | Complete as evidence path; runtime activation remains separate | `antfarm-runtime-evidence-2026-05-24.md`, ADP-410, ADP-404 |

## Phase B Exit Evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Migration packet ready | Complete for Atlas packet | `migrations/001_v31_expand.sql` through `004_v31_rollback.sql` |
| Eight net-new tables defined | Complete | `migrations/001_v31_expand.sql`, `schema_classification.yaml` |
| Tenant registry and compliance config registered | Complete as packet; runtime sync pending | `tenant_compliance.yaml` |
| Vault split operational | Partial | Roots/policy exist; run `validation/vault_route_checks.sh`; Syncthing device/access controls need operator IDs |
| Dashboard MVP isolation tests passing | Pending Leo/Simon runtime | `dashboard-operator-isolation-spec.md` |
| Validators pass on tenant-scoped data | Packet ready; runtime execution pending | `validation/v31_validation_queries.sql`, `validation/event_type_validator_cases.sql` |
| Day2 Ops fallback documented | Complete | `day2-ops-interface-and-activation-gate.md`, `tenant_compliance.yaml` |

## Blockers Before Marking Phase B Complete

- Run migrations against a disposable copy, then production during approved window.
- Simon must wire application validators and consume `schema_classification.yaml`.
- Syncthing actual device IDs/access controls must be configured and recorded.
- Dashboard API isolation tests must pass against live API.
- Runtime activation evidence chain must land factory item, run, and event rows in live `antfarm.db`.

## Commands

```bash
md5 /Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/antfarm-schema-snapshot-2026-05-24.sql
bash /Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/validation/vault_route_checks.sh
sqlite3 /path/to/disposable-antfarm.db < migrations/001_v31_expand.sql
sqlite3 /path/to/disposable-antfarm.db < migrations/002_v31_backfill.sql
sqlite3 /path/to/disposable-antfarm.db < validation/v31_validation_queries.sql
```
