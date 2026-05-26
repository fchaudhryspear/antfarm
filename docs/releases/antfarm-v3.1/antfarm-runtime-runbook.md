# Antfarm Runtime Runbook

Date: 2026-05-25
Owner: Optimus for project-control reconciliation; Simon/Atlas own runtime implementation details.

## Runtime Model

Current runtime model is explicit invocation plus OpenClaw gateway-managed cron pickup:

- `antfarm workflow run <workflow-id> "<task>"` writes run and step rows into `~/.openclaw/antfarm/antfarm.db`.
- Antfarm then reconciles per-agent cron jobs through the OpenClaw gateway cron tool.
- Gateway cron jobs call Antfarm `step peek` / `step claim` / `step complete` operations.
- Runtime/system events with no factory item parent are written to `factory_system_events`.
- Tenant work events are written to `factory_events`.

This is not a persistent `ai.openclaw.antfarm.plist` service. The persistent supervisor is the OpenClaw gateway on `127.0.0.1:18789`; Antfarm work advances through gateway cron jobs and explicit Antfarm CLI/runtime API calls.

## Start

Use the full CLI path:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <workflow-id> "<task>"
```

For already-installed workflows, this creates the run, creates or reconciles workflow cron jobs through the OpenClaw gateway, and leaves the run for cron pickup.

If gateway cron state needs repair after a gateway restart:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js cron-recovery
```

For a specific workflow:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow ensure-crons <workflow-id>
```

## Stop

Stop a run without removing workflows:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow stop <run-id>
```

Remove cron pickup for a workflow only when no active run depends on it:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow uninstall <workflow-id>
```

Do not uninstall all workflows or remove crons during active project work unless the active runs are intentionally cancelled.

## Health Checks

Gateway reachability:

```bash
openclaw gateway call health --json
openclaw cron list --json --all
```

Antfarm runtime state:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow runs
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status <run-id-or-prefix>
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs <run-id-or-prefix>
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js medic run --json
```

SQLite evidence:

```bash
sqlite3 ~/.openclaw/antfarm/antfarm.db '.tables'
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, workflow_id, status, task, created_at, updated_at from runs order by created_at desc limit 5;"
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select run_id, step_id, agent_id, status, retry_count, created_at, updated_at from steps order by updated_at desc limit 20;"
```

Factory ledger evidence:

```bash
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, status, lifecycle_stage, title from factory_items order by created_at desc limit 10;"
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, factory_item_id, workflow_id, status from factory_runs order by started_at desc limit 10;"
sqlite3 -header -column ~/.openclaw/antfarm/antfarm.db \
  "select id, tenant_id, event_type, actor from factory_events order by created_at desc limit 10;"
```

## Logs

Antfarm CLI event log:

```bash
tail -80 ~/.openclaw/antfarm/events.jsonl
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs <run-id-or-prefix>
```

macOS unified log query:

```bash
/usr/bin/log show --predicate 'eventMessage CONTAINS[c] "antfarm"' --last 1h --info
```

Gateway logs:

```bash
openclaw logs --lines 200
```

Dashboard logs:

```bash
tail -200 ~/.openclaw/antfarm/dashboard.log
tail -200 ~/.openclaw/antfarm/dashboard.err.log
```

## Failure Recovery

1. Check gateway health first. If `/health` is live but `gateway call health` is degraded, avoid launching new swarms until event-loop health recovers.
2. Check for stale active runs with `workflow runs`.
3. Run `cron-recovery --dry-run` to see which workflow crons would be reconciled.
4. Run `cron-recovery` only if active runs should keep advancing.
5. If a run is stale and should not advance, stop it with `workflow stop <run-id>` before removing crons.
6. Record any manual stop/recovery action in the relevant Linear issue and local evidence packet.

## ADP-404 Closure Rule

ADP-404 can close only when all of the following are linked:

- This runbook or a successor runtime runbook.
- Gateway dispatch or gateway cron pickup proof against `127.0.0.1:18789`.
- Runtime acknowledgment or Antfarm step pickup evidence.
- A factory ledger chain in live `antfarm.db`.
- Logging evidence from Antfarm events and/or macOS unified logging.

