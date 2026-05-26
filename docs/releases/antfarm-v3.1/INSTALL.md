# Antfarm v3.1 Installation Guide

This guide packages the v3.1 Multi-Tenant Software Factory work so a fresh
OpenClaw/Hermes operator host can reproduce the reviewed setup.

The release is not just the RFC. It includes runtime code, SQL migrations,
tenant policy configuration, validation checks, Obsidian vault routing, Day2
Ops integration contracts, and evidence packets.

This is internal operational documentation. It is not legal, compliance, financial, or customer-facing advice, and it does not certify that any tenant or deployment satisfies a regulatory framework. Operators must use the referenced runbooks, approvals, evidence packets, and counsel/compliance review where required before relying on these controls for customer, regulatory, or external commitments.

## Scope

This repository owns the Antfarm runtime pieces:

- Factory ledger schema and store helpers.
- Tenant policy and compliance gates.
- Context pack generation and redaction.
- RTBF, KMS proof, and audit hashing primitives.
- Dashboard tenant isolation helpers.
- Production activation gate recording.
- v3.1 release artifacts under this directory.

OpenClaw owns the gateway/control plane. Hermes owns the operator control
plane. A fresh installation needs all three repositories installed, but this
release pack is the Antfarm source of truth for v3.1.

## Prerequisites

- Node.js 22 or newer.
- A working OpenClaw install with gateway and cron support.
- A Hermes/operator checkout if the operator UI is part of the target host.
- `sqlite3` available for migration inspection and manual application.
- `gh` CLI if PR-producing workflows will be used.
- Reviewed operator approval before enabling production-facing runtime paths.

## Fresh Host Setup

1. Clone and build OpenClaw, Antfarm, and Hermes.

   ```bash
   git clone https://github.com/fchaudhryspear/openclaw.git
   git clone https://github.com/fchaudhryspear/antfarm.git
   git clone https://github.com/outsourc-e/hermes-workspace.git

   cd antfarm
   npm install
   npm run build
   npm test
   ```

2. Install or update Antfarm on the host.

   ```bash
   npm run build
   node dist/cli/cli.js install
   node dist/cli/cli.js workflow list
   ```

   The current reviewed mainline should install these bundled workflows:

   ```text
   pipeline-orchestrator
   smoke-test-s3-v1
   smoke-test-v1
   swarm-architecture-v1
   swarm-code-fix-v1
   swarm-code-review-v3
   swarm-implement-v1
   swarm-qa-v1
   swarm-release-v1
   swarm-requirements-v1
   ```

   If install fails on bundled workflow contract errors, update to Antfarm
   `main` at or after PR `#16` (`9595962`) before continuing.

3. Back up the Antfarm database before schema changes.

   ```bash
   cp "$HOME/.openclaw/antfarm/antfarm.db" \
     "$HOME/.openclaw/antfarm/antfarm.db.pre-v31.$(date +%Y%m%d%H%M%S)"
   ```

4. Apply the v3.1 migrations in order.

   ```bash
   sqlite3 "$HOME/.openclaw/antfarm/antfarm.db" < docs/releases/antfarm-v3.1/migrations/001_v31_expand.sql
   sqlite3 "$HOME/.openclaw/antfarm/antfarm.db" < docs/releases/antfarm-v3.1/migrations/002_v31_backfill.sql
   sqlite3 "$HOME/.openclaw/antfarm/antfarm.db" < docs/releases/antfarm-v3.1/migrations/003_v31_enforce.sql
   ```

   Keep `migrations/004_v31_rollback.sql` available for a reviewed rollback.

5. Install tenant configuration.

   Runtime defaults live in:

   - `config/tenants.yaml`
   - `config/tenant_compliance.yaml`

   The richer reviewed operator reference is:

   - `tenant_compliance.yaml`
   - `tenant-compliance-template.yaml`
   - `factory-vault-routes.yaml`

   Do not add tenant-specific secrets to these files. Store secrets through
   the host secret manager or OpenClaw/Hermes-approved credential path.

6. Configure the two-vault Obsidian layout.

   Follow:

   - `vault-routing-policy.md`
   - `vault-routing-verification.md`
   - `evidence/adp-414-closure-runbook-2026-05-25.md`

   The reviewed v3.1 closure deferred live Syncthing activation. A new host
   must record folder IDs, device allowlists, ignore patterns, and sensitive
   vault access-control evidence before calling vault sync operational.

7. Configure Day2 Ops integration as a gated interface.

   Follow:

   - `day2-ops-interface-and-activation-gate.md`
   - `notification-pii-policy.md`

   Day2 Ops fallback is allowed only through the documented activation gate.
   Production-touching finance and PII paths require founder-class authority.

8. Validate the runtime.

   ```bash
   npm test -- src/factory/v31-policy.test.ts src/factory/store.test.ts src/factory/context-pack.test.ts
   sqlite3 "$HOME/.openclaw/antfarm/antfarm.db" < docs/releases/antfarm-v3.1/validation/v31_validation_queries.sql
   bash docs/releases/antfarm-v3.1/validation/vault_route_checks.sh
   ```

9. Run the runtime activation proof.

   Follow `antfarm-runtime-runbook.md`. The reviewed evidence packet is in:

   - `evidence/adp-404-gateway-runtime-evidence-2026-05-25.md`
   - `evidence/adp-424-isolated-proof-agent-shell-tools-evidence-2026-05-25.md`

   A fresh host should produce its own run IDs, ledger rows, log lines, and
   gateway health evidence. Do not reuse the historical proof as live proof.

10. Record hashes and evidence.

    Update `HASHES.md` when release artifacts change. New operational proof
    belongs in an evidence file with SHA-256 recorded in the same batch.

## Validation Boundary

The v3.1 closure evidence proves a documented/design freeze and minimal runtime
proof. It does not prove broad tenant production operations on a new host.
Operational validation and tenant onboarding continue in v3.2.

The successful bundled workflow install confirms only the Antfarm workflow
package contract on the host. It does not approve tenant-specific production
activation, vault sync, RTBF handling, customer reliance, or compliance claims.

## Rollback

Rollback is operator-controlled:

1. Stop Antfarm cron dispatch for the affected workflow.
2. Preserve logs and the current database copy.
3. Apply `migrations/004_v31_rollback.sql` only after reviewed approval.
4. Restore the pre-v3.1 database backup if rollback SQL is insufficient.
5. Record the rollback decision, actor, database hash, and post-rollback checks.
