# Agent Swarm 3 User Manual

Last updated: 2026-05-25
Audience: operators, tenant onboarding owners, factory reviewers, and OpenClaw/Hermes installers

This is internal operational documentation. It is not legal, compliance, financial, or customer-facing advice, and it does not certify that any tenant or deployment satisfies a regulatory framework. Operators must use the referenced runbooks, approvals, evidence packets, and counsel/compliance review where required before relying on these controls for customer, regulatory, or external commitments.

This manual explains how to set up and operate Agent Swarm 3, the Antfarm v3/v3.1 multi-agent factory model. It is written for a fresh OpenClaw/Hermes/Antfarm installation where another operator needs enough context to bring up a working factory and understand the remaining v3.1 gates.

## Scope

Agent Swarm 3 is the multi-tenant software factory operating model for Antfarm. It combines:

- OpenClaw gateway and control-plane access.
- Antfarm workflow execution runtime.
- Hermes operator control-plane workflows.
- Tenant configuration.
- Factory ledger tables.
- Audit logging, internal tenant classification, redaction, and vault-routing controls.
- Day 2 Ops approval and incident interfaces.

The GitHub release bundle lives in the Antfarm repository at:

```text
docs/releases/antfarm-v3.1/
```

After installation, operators may also keep or copy the same bundle locally at:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/
```

Use the GitHub bundle as the source of truth for RFC text, migrations, evidence packets, validation scripts, and hash manifests. Any local copy should be treated as a deployed copy of that reviewed release bundle.

## Current v3.1 Posture

The v3.1 design and evidence packet is frozen for review. It is not just an RFC upload. A complete setup requires:

- RFC and acceptance model.
- v3.0 and v3.1 migration scripts.
- `tenant_id` enforcement on tenant-scoped factory data.
- Tenant configuration files.
- Two-vault Obsidian routing.
- Day 2 Ops interface and activation gate.
- Tenant-configured redaction rulesets.
- RTBF, KMS, and audit hashing behavior.
- Dashboard/operator isolation behavior.
- Runtime activation runbook.
- A meta-installation path tying OpenClaw, Antfarm, and Hermes together.

Treat v3.1 as a release candidate for factory setup. Treat v3.2 as the follow-on operational validation and tenant onboarding phase unless the project plan says otherwise.

## Required Repositories

Fresh setup expects clones of:

- `openclaw`: gateway and local control plane.
- `antfarm`: execution runtime and workflow engine.
- `hermes`: operator control plane.

Recommended local layout:

```text
~/.openclaw/workspace/openclaw
~/.openclaw/workspace/antfarm
~/.openclaw/workspace/hermes
~/.openclaw/antfarm/workflows/antfarm-v3.1
```

## Download And Setup On A New OpenClaw Or Hermes Host

Use GitHub as the source of truth for a fresh host:

```bash
git clone https://github.com/fchaudhryspear/antfarm.git ~/.openclaw/workspace/antfarm
cd ~/.openclaw/workspace/antfarm
git checkout main
```

Then build and validate Antfarm:

```bash
npm install
npm run build
npm test -- --runInBand
```

Copy or reference the v3.1 release bundle from:

```text
docs/releases/antfarm-v3.1/
```

For Hermes operators, register the Antfarm workspace in the Hermes/OpenClaw operator environment, then use this manual and `docs/releases/antfarm-v3.1/INSTALL.md` as the setup entry points. A clone does not automatically activate tenant runtime work; migrations, vault routing, tenant onboarding, and Day 2 Ops gates must still be executed through the reviewed runbooks.

## Host Requirements

- Node.js 22 or newer.
- Git and GitHub CLI.
- SQLite CLI.
- OpenClaw gateway reachable on the host.
- Antfarm built from source or installed through the approved OpenClaw/Antfarm install path.
- Hermes available for operator workflows.
- Optional but expected for real tenant operation: Obsidian vaults and Syncthing routing configured.

Verify Node before installing Antfarm:

```bash
node --version
```

Antfarm requires real Node.js 22+. Bun's node wrapper can fail on `node:sqlite`.

## Build Antfarm

From the Antfarm repository:

```bash
cd ~/.openclaw/workspace/antfarm
npm install
npm run build
```

For local CLI calls, use the explicit built CLI path:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js --help
```

If the `antfarm` shell command is installed and points to the same build, it can be used as a shorter equivalent.

## Install Workflows

Install all bundled workflows:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js install
```

Install a specific workflow:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow install <workflow-id>
```

List installed workflows:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow list
```

## Runtime Model

Agent Swarm 3 advances work through explicit Antfarm runs and OpenClaw gateway-managed cron pickup.

The runtime flow:

1. Operator starts a workflow run.
2. Antfarm writes run and step rows into `~/.openclaw/antfarm/antfarm.db`.
3. Antfarm reconciles per-agent cron jobs through the OpenClaw gateway.
4. Gateway cron jobs call step peek, claim, and complete operations.
5. Tenant work events go to `factory_events`.
6. Runtime/system events without a factory item parent go to `factory_system_events`.

This is not a standalone persistent Antfarm daemon. The always-on supervisor is the OpenClaw gateway plus reconciled cron jobs.

Start a run:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <workflow-id> "<task>"
```

Check status:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow runs
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status <run-id-or-prefix>
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs <run-id-or-prefix>
```

Repair cron pickup after gateway restart:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js cron-recovery --dry-run
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js cron-recovery
```

Stop a run:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow stop <run-id>
```

## Gateway Checks

Verify OpenClaw gateway health:

```bash
openclaw gateway call health --json
openclaw cron list --json --all
```

If gateway health is degraded, do not launch new swarms until the gateway event loop and cron pickup are stable.

## Dashboard

Start the Antfarm dashboard:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js dashboard
```

Stop or inspect dashboard state:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js dashboard status
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js dashboard stop
```

Dashboard isolation for v3.1 must follow the operator isolation spec in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/dashboard-operator-isolation-spec.md
```

Operators should only see tenants and runs they are authorized to inspect.

## Tenant Configuration

Tenant setup uses:

```text
config/tenants.yaml
config/tenant_compliance.yaml
```

The canonical v3.1 template and review candidate are also in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/tenant-compliance-template.yaml
~/.openclaw/antfarm/workflows/antfarm-v3.1/tenant_compliance.yaml
```

Each tenant needs:

- `tenant_id`
- display name
- internal compliance class
- vault route
- model eligibility
- dashboard visibility expectations
- approval route or fallback route
- redaction ruleset
- evidence packet location

Initial Phase E tenant order:

1. Credologi
2. Utility Valet
3. Spearhead
4. FCRP Capital
5. Starship Residential

Flobase remains the prototype tenant before broader onboarding.

## Schema and Migration Setup

The v3.1 migration packet is in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/migrations/
```

Expected migration sequence:

1. `001_v31_expand.sql`
2. `002_v31_backfill.sql`
3. `003_v31_enforce.sql`
4. `004_v31_rollback.sql` only for reviewed rollback

Before applying migrations:

- Back up `~/.openclaw/antfarm/antfarm.db`.
- Read the SQL.
- Confirm the target database is the intended local/runtime database.
- Run validation scripts from `validation/`.
- Record command output and database path in the evidence packet.

Do not apply tenant enforcement to a production-like runtime without an accepted backup and rollback plan.

## Factory Ledger Checks

Inspect runtime state:

```bash
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, workflow_id, status, task, created_at, updated_at from runs order by created_at desc limit 5;"

sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select run_id, step_id, agent_id, status, retry_count, created_at, updated_at from steps order by updated_at desc limit 20;"
```

Inspect factory ledger state:

```bash
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, status, lifecycle_stage, title from factory_items order by created_at desc limit 10;"

sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, factory_item_id, workflow_id, status from factory_runs order by started_at desc limit 10;"

sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, event_type, actor from factory_events order by created_at desc limit 10;"
```

System events without tenant work parents belong in `factory_system_events`.

## Vault Routing

The v3.1 vault split is documented in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/vault-routing-policy.md
~/.openclaw/antfarm/workflows/antfarm-v3.1/vault-routing-verification.md
~/.openclaw/antfarm/workflows/antfarm-v3.1/factory-vault-routes.yaml
```

Operator rule:

- Shared, non-sensitive work can route to `factory-shared`.
- Sensitive tenant work routes to the tenant-sensitive vault.
- Finance and founder-class security changes require the stricter route.
- If the sensitive vault or Syncthing route is unavailable, do not proceed with that tenant gate.

## Compliance and Redaction

Each tenant maps to an internal compliance class and redaction ruleset.

Expected v3.1 rulesets:

- `default_v1`
- `finance_v1`
- `pii_v1`

Audit payloads, notifications, Linear comments, and dashboard surfaces must not expose raw PII or natural subject identifiers. Finance tenants require finance redaction behavior before onboarding evidence can close.

## RTBF, KMS, and Audit Hashing

RTBF architecture is documented in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/rtbf-kms-audit-packet.md
```

Operating rules:

- Store opaque KMS references and keyed subject hashes only.
- Do not store natural subject identifiers in SQLite audit tables, Linear comments, notifications, or deletion proofs.
- Finance tenants currently use the Option A hash-persistence model.
- Future strict PII tenants may require Option B lookup-pepper destruction.
- Production RTBF activation remains blocked until the second founder-class recovery approver is named.

## Day 2 Ops Interface

The v3.1 Day 2 Ops interface is documented in:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/day2-ops-interface-and-activation-gate.md
```

Current model:

- Linear comments provide the operator decision UX.
- Antfarm audit ledger remains authoritative.
- Until Day 2 Ops identity is fully activated, `day2_ops` resolves to Faisal as fallback.

Accepted approval comment forms:

```text
APPROVE <request_id>
DENY <request_id> <reason>
ESCALATE <request_id> <reason>
```

Malformed or unknown comments do not authorize work.

## Evidence and Hashes

When changing v3.1 artifacts, update:

```text
~/.openclaw/antfarm/workflows/antfarm-v3.1/HASHES.md
```

Evidence packets should include:

- command output
- database row IDs
- dashboard query output or screenshot references
- audit event IDs
- Linear issue or comment links
- file hashes for reviewed artifacts

Prose-only intent is not sufficient for a gate close.

## Troubleshooting

Workflow run does not advance:

- Check OpenClaw gateway health.
- Check cron list.
- Run `cron-recovery --dry-run`.
- Inspect `runs` and `steps` tables.
- Stop stale runs before uninstalling workflows.

Agent has no tools:

- Confirm the workflow agent definition includes the needed tool permissions.
- Confirm OpenClaw exposes those tools to the agent session.
- Re-run the proof only after the tool surface is visible.

Tenant data appears across boundaries:

- Stop the onboarding gate.
- Capture the query or screenshot.
- Check tenant filters in dashboard/API paths.
- Check `tenant_id` migration/enforcement state.
- Open a blocker; do not continue tenant rollout.

Vault route unavailable:

- Do not reroute sensitive work to a shared vault as a convenience.
- Record the blocked route.
- Fix Syncthing or vault setup before continuing.

RTBF validation fails:

- Do not activate RTBF in production-like workflows.
- Capture the failing validator output.
- Fix hashing, KMS reference, or redaction behavior before proceeding.

## Operator Boundaries

- Do not onboard a real tenant with sensitive data until tenant config, internal compliance class, vault route, dashboard isolation, and Day 2 Ops fallback are all documented.
- Do not bypass `security_changes` for founder-class settings.
- Do not treat Linear comments as the source of truth; they are operator UX.
- Do not run destructive database migrations without backup and rollback evidence.
- Do not publish raw PII in audit payloads, notifications, Linear, or dashboards.

## Ready-To-Use Checklist

Agent Swarm 3 is ready for a new OpenClaw/Hermes host when:

- OpenClaw gateway health is clean.
- Antfarm builds and the CLI runs.
- Hermes is installed and reachable for operator workflows.
- Bundled workflows install successfully.
- A workflow run advances through gateway cron pickup.
- v3.1 migrations validate against the target database.
- Tenant config and tenant compliance configuration are present.
- Vault routing is verified.
- Dashboard isolation tests pass.
- Day 2 Ops approval fallback or live identity is recorded.
- Evidence packet and hashes are updated.
