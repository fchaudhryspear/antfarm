# ADP-404 Gateway Runtime Evidence - 2026-05-25

Purpose: reconcile ADP-404 parent runtime activation against completed ADP-410 evidence without starting another full swarm while a stale Antfarm run is still present.

## Summary

ADP-410 supplies the factory ledger proof. This packet adds gateway/cron pickup evidence, logging evidence, and the operational runbook pointer.

Current disposition:

- Runtime runbook: present at `antfarm-runtime-runbook.md`.
- Gateway reachability: `http://127.0.0.1:18789/health` returned HTTP 200 with `{"ok":true,"status":"live"}`.
- Gateway cron surface: `openclaw cron list --json --all` returned Antfarm cron jobs, proving the gateway cron registry path is readable through the OpenClaw CLI.
- Runtime pickup evidence: existing run `f2efe93e-c397-4052-a4e2-191331a25696` shows Antfarm steps claimed/picked up by workflow agents in `events.jsonl` and `antfarm logs`.
- Ledger evidence: ADP-410 rows exist for `factory_items` -> `factory_runs` -> `factory_events`, plus `factory_system_events.runtime_started`.
- Logging evidence: Antfarm `events.jsonl`, `antfarm logs f2efe93e`, and macOS unified log output are included below.

Remaining caution:

- A fresh `openclaw gateway call health --json` on 2026-05-25 13:51 CDT returned `ok=true` but event loop degraded (`event_loop_delay`, `event_loop_utilization`, `cpu`). Do not launch extra live swarms just to create duplicate proof while gateway health is degraded.
- The strongest live factory ledger proof is ADP-410's controlled runtime/API invocation path. The gateway pickup proof is Antfarm workflow/cron pickup evidence, not a new ADP-404-specific full workflow run.

## Commands and Output

### Gateway Health

Command:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
import os from 'node:os';
const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/.openclaw/openclaw.json`, 'utf8'));
const port = cfg.gateway?.port ?? 18789;
const res = await fetch(`http://127.0.0.1:${port}/health`);
console.log(await res.text());
NODE
```

Output:

```json
{"ok":true,"status":"live"}
```

`openclaw gateway call health --json` returned `ok=true`, but the event loop was degraded during the check:

```json
{
  "ok": true,
  "eventLoop": {
    "degraded": true,
    "reasons": ["event_loop_delay", "event_loop_utilization", "cpu"],
    "intervalMs": 13288,
    "delayP99Ms": 10301.2,
    "delayMaxMs": 10301.2,
    "utilization": 1,
    "cpuCoreRatio": 1.005
  }
}
```

### Gateway Cron Registry

Command:

```bash
openclaw cron list --json --all | jq '[.jobs[]? | select(.name|startswith("antfarm/")) | {id,name,enabled,nextRunAt,lastRunAt}]'
```

Output excerpt:

```json
[
  {
    "id": "33abb0ac-d306-44b6-93bc-ffffd3ca643c",
    "name": "antfarm/pipeline-orchestrator/pipeline-reporter",
    "enabled": false,
    "nextRunAt": null,
    "lastRunAt": null
  },
  {
    "id": "5ffeb123-1e4c-4991-971e-37c381f82004",
    "name": "antfarm/pipeline-orchestrator/pipeline-controller",
    "enabled": false,
    "nextRunAt": null,
    "lastRunAt": null
  },
  {
    "id": "89c2aa5e-23ed-402d-95dc-0216cedae9a0",
    "name": "antfarm/swarm-implement-v1/backend-engineer",
    "enabled": false,
    "nextRunAt": null,
    "lastRunAt": null
  }
]
```

Interpretation: gateway cron registry is reachable. Current Antfarm cron jobs are disabled, which matches the prior cron-storm mitigation and is why a new full dispatch was not started for proof generation.

### Runtime Pickup Evidence

Command:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status f2efe93e
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs f2efe93e
```

Output excerpt:

```text
Run: #442 (f2efe93e-c397-4052-a4e2-191331a25696)
Workflow: swarm-code-review-v3
Status: running

Steps:
  [pending] code-quality-review (swarm-code-review-v3_code-quality)
  [pending] security-audit (swarm-code-review-v3_security-auditor)
  [pending] performance-review (swarm-code-review-v3_performance-engineer)
  [pending] ux-review (swarm-code-review-v3_ux-specialist)
  [pending] backend-review (swarm-code-review-v3_backend-architect)
```

```text
01:45 PM  [f2efe93e]  code-quality  Claimed step
01:45 PM  [f2efe93e]  security-auditor  Claimed step
01:45 PM  [f2efe93e]  performance-engineer  Claimed step
01:45 PM  [f2efe93e]  ux-specialist  Claimed step
01:45 PM  [f2efe93e]  backend-architect  Claimed step
01:45 PM  [f2efe93e]  frontend-architect  Claimed step
01:45 PM  [f2efe93e]  devops-engineer  Claimed step
01:45 PM  [f2efe93e]  documentation-specialist  Claimed step
01:45 PM  [f2efe93e]  testing-strategist  Claimed step
01:45 PM  [f2efe93e]  product-strategist  Claimed step
07:04 PM  [f2efe93e]  Step timed out (Model escalated to ollama-cloud/kimi-k2.6:cloud on retry 1)
```

SQLite step pickup query:

```sql
select run_id, step_id, agent_id, status, retry_count, created_at, updated_at
from steps
where run_id='f2efe93e-c397-4052-a4e2-191331a25696'
order by step_index
limit 12;
```

Output excerpt:

```text
run_id                                step_id              agent_id                                       status   retry_count
------------------------------------  -------------------  ---------------------------------------------  -------  -----------
f2efe93e-c397-4052-a4e2-191331a25696  code-quality-review  swarm-code-review-v3_code-quality              pending  0
f2efe93e-c397-4052-a4e2-191331a25696  security-audit       swarm-code-review-v3_security-auditor          pending  0
f2efe93e-c397-4052-a4e2-191331a25696  backend-review       swarm-code-review-v3_backend-architect         pending  1
```

Interpretation: Antfarm runtime has demonstrably picked up workflow steps through its agent/cron path, but this specific stale run should not be used as a completion proof for project work.

### Factory Ledger Chain from ADP-410

Command:

```sql
select id, tenant_id, status, lifecycle_stage, title
from factory_items
where id='adp410_item_1779706914585';

select id, tenant_id, factory_item_id, workflow_id, status
from factory_runs
where id='adp410_run_1779706914585';

select id, tenant_id, event_type, actor
from factory_events
where factory_run_id='adp410_run_1779706914585';

select id,event_type,tenant_id,actor
from factory_system_events
where id='adp410_system_1779706914593';
```

Output:

```text
id                         tenant_id  status  lifecycle_stage  title
-------------------------  ---------  ------  ---------------  -------------------------------------
adp410_item_1779706914585  flobase    done    completed        Controlled Flobase v3.1 runtime proof

id                        tenant_id  factory_item_id            workflow_id                            status
------------------------  ---------  -------------------------  -------------------------------------  ---------
adp410_run_1779706914585  flobase    adp410_item_1779706914585  antfarm-v3.1-controlled-flobase-proof  completed

id                          tenant_id  event_type                         actor
--------------------------  ---------  ---------------------------------  -----
adp410_event_1779706914585  flobase    workflow.controlled_runtime_proof  Simon

id                           event_type       tenant_id  actor
---------------------------  ---------------  ---------  -----
adp410_system_1779706914593  runtime_started             Simon
```

### macOS Unified Log Evidence

Command:

```bash
timeout 20 /usr/bin/log show --predicate 'eventMessage CONTAINS[c] "antfarm"' --last 1h --info | tail -80
```

Output excerpt:

```text
2026-05-25 13:40:12.359220-0500 kernel: (AppleSystemPolicy) evaluation result: 13115, script, allowed, cache, ..., /Users/faisalshomemacmini/.openclaw/workspace/antfarm/node_modules/typescript/bin/tsc
2026-05-25 13:49:41.726214-0500 log: [com.apple.log:] log run noninteractively, parent: 65516 (zsh), args: '/usr/bin/log' 'show' '--predicate' 'eventMessage CONTAINS[c] "antfarm"' '--last' '24h' '--info'
2026-05-25 13:51:20.957290-0500 log: [com.apple.log:] log run noninteractively, parent: 66301 (gtimeout), args: '/usr/bin/log' 'show' '--predicate' 'eventMessage CONTAINS[c] "antfarm"' '--last' '1h' '--info'
```

Interpretation: macOS unified logging has Antfarm-related entries, but it does not currently show a clean application-level Antfarm runtime event for the ADP-410 controlled workflow. Antfarm's own `events.jsonl` and SQLite evidence are stronger runtime logs today.

## Closure Recommendation

ADP-404 is close, but should remain `In Progress` until one of these happens:

1. Simon/Atlas posts one clean, current gateway-dispatched proof run that does not launch a large swarm and captures:
   - gateway dispatch through `127.0.0.1:18789`;
   - runtime pickup/ack;
   - factory ledger row IDs;
   - Antfarm event log lines;
   - gateway health not degraded during the run; or
2. Faisal/Optimus explicitly accepts the combined evidence here plus ADP-410 as sufficient despite the absence of a fresh ADP-404-specific gateway dispatch run.

ETA after the decision: about 30 minutes to update Linear, refresh hashes, and close ADP-404 if accepted.

## Fresh ADP-404 Gateway Smoke Addendum - 2026-05-25 14:54 CDT

Scope: small ADP-404-specific proof only. No large swarm was launched.

Gateway health after the run was non-degraded:

```json
{
  "ok": true,
  "eventLoop": {
    "degraded": false,
    "reasons": [],
    "intervalMs": 3847,
    "delayP99Ms": 29.9,
    "delayMaxMs": 38.6,
    "utilization": 0.059,
    "cpuCoreRatio": 0.077
  }
}
```

Antfarm run and step:

```text
run_id: 7fabf44b-17f0-4535-93ae-b1f13d17323b
run_number: 444
workflow_id: adp-404-gateway-smoke-v1
task: ADP-404 fresh gateway proof - single probe only
run_status: completed
step_id: cd80c773-8216-4356-b2d3-c01e78dad1a0
step_key: gateway-proof
agent_id: adp-404-gateway-smoke-v1_probe
step_status: done
step_output:
  SCORE: 100
  ADP404_GATEWAY_PROOF: complete
  PROOF_SCOPE: ADP-404
  PROOF_TIMESTAMP: 2026-05-25T19:54:56Z
```

Antfarm event log lines:

```text
02:50 PM  [7fabf44b]  probe  Claimed step
02:54 PM  [7fabf44b]  probe  Claimed step
02:54 PM  [7fabf44b]  Step completed
02:54 PM  [7fabf44b]  Run completed
```

Factory ledger rows:

```text
factory_items:
adp404_item_1779738875 | flobase | done | completed | ADP-404 fresh gateway runtime proof

factory_runs:
adp404_run_1779738875 | flobase | adp404_item_1779738875 | adp-404-gateway-smoke-v1 | 7fabf44b-17f0-4535-93ae-b1f13d17323b | completed

factory_events:
adp404_event_1779738875 | flobase | workflow.gateway_smoke_proof | Optimus | {"antfarm_run_id":"7fabf44b-17f0-4535-93ae-b1f13d17323b","step_id":"cd80c773-8216-4356-b2d3-c01e78dad1a0","cron_job_ids":["8a79ea31-d13f-4ca8-aea4-13443b9dfd64","949e4abc-1a95-4e20-b872-28ff37e0e6f2"],"result":"completed_with_cron_shell_tool_blocker"}

factory_system_events:
adp404_system_1779738875 | runtime_started | Optimus | {"workflow_id":"adp-404-gateway-smoke-v1","gateway":"127.0.0.1:18789","health_pre":"not_degraded","health_post":"captured"}
```

Important caveat: the OpenClaw cron/gateway dispatch path accepted and ran the single-shot cron jobs, but the isolated agent turn reported no shell execution tool available. The Antfarm step was therefore completed through the local step API after gateway enqueue rather than by a fully autonomous cron agent shell command. This is sufficient evidence for the small gateway/Antfarm pickup path if Optimus accepts that caveat; otherwise ADP-404's remaining blocker is to enable shell tools for the isolated proof agent and rerun the same single-step workflow.
