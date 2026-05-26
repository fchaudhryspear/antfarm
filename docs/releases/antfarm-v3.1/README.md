# Antfarm v3.1 Canonical Artifacts

This directory is the canonical home for Antfarm v3.1 Multi-Tenant Software Factory artifacts.

Desktop, Downloads, chat attachment, and copied reviewer files are non-canonical unless copied back here and recorded in `HASHES.md`.

## Core Artifacts

- `INSTALL.md` - meta-installation guide for setting up v3.1 on a fresh OpenClaw/Hermes host.
- `RFC-antfarm-v3.1.md` - current RFC text and acceptance model.
- `antfarm-schema-snapshot-2026-05-24.sql` - verified v3.0/v3.1 schema evidence snapshot.
- `antfarm-runtime-evidence-2026-05-24.md` - runtime dormancy evidence and activation context.
- `vault-routing-policy.md` - ADP-414 Leo operator policy for the two-vault split and routing behavior.
- `dashboard-operator-isolation-spec.md` - ADP-415 Leo dashboard/operator behavior contract and adversarial test matrix.
- `tenant-onboarding-runbook.md` - ADP-419 Phase E tenant onboarding runbook and per-tenant gates.
- `notification-pii-policy.md` - ADP-422 operator notification no-raw-PII policy and enforcement handoff.
- `factory-vault-routes.yaml` - operator-readable desired vault route projection for v3.1.
- `tenant-compliance-template.yaml` - onboarding template for complete tenant compliance entries.
- `tenant_compliance.yaml` - Phase A/B source-of-truth candidate with Day2 Ops fallback and authority matrix.
- `schema_classification.yaml` - ADP-409 existing/net-new table classification packet.
- `event_type_tenant_requirement.yaml` - audit-global event type tenant requirement matrix.
- `migrations/` - forward, enforcement, and rollback SQL for the v3.1 migration packet.
- `validation/` - SQL and shell checks for migration, event validation, retention, and vault routing.
- `rtbf-kms-audit-packet.md` - ADP-413 KMS/envelope-key/audit hashing architecture packet.
- `day2-ops-interface-and-activation-gate.md` - ADP-416 interface decision, fallback behavior, and activation gate.
- `vault-routing-verification.md` - ADP-414 storage/sync/runtime projection verification.
- `evidence/phase-ab-gate-evidence-packet.md` - ADP-423 consolidated Phase A/B gate packet.
- `evidence/adp-414-closure-runbook-2026-05-25.md` - ADP-414 Syncthing closure runbook and evidence checklist.
- `evidence/adp-414-closeout-deferral-2026-05-25.md` - ADP-414 Atlas closeout with explicit Syncthing activation deferral.
- `HASHES.md` - manifest of file hashes and line counts for review references.

## Update Rule

Any artifact update must update `HASHES.md` in the same change batch. Linear comments, red-team findings, and review packets should cite this directory plus the file hash they reviewed.
