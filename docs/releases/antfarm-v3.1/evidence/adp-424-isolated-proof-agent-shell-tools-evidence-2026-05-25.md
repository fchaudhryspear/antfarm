# ADP-424 Isolated Proof-Agent Shell Tools Evidence - 2026-05-25

## Summary

ADP-424 was created to close the caveat from ADP-404: gateway-isolated proof-agent turns could run, but the isolated context did not expose shell execution tools. NexDev enabled explicit shell-tool allowlisting for Antfarm polling crons, refreshed the ADP-404 smoke workflow cron, and reran the one-step proof autonomously.

Result: PASS.

## Code Changes

Repository: `/Users/faisalshomemacmini/.openclaw/workspace/antfarm`

Changed files:

- `src/installer/types.ts`
  - Added `WorkflowAgent.toolsAllow?: string[]`.
  - Added `PollingConfig.toolsAllow?: string[]`.
- `src/installer/agent-cron.ts`
  - Normalizes `toolsAllow`.
  - Passes per-agent `toolsAllow` first, falling back to workflow-level `polling.toolsAllow`.
  - Includes `toolsAllow` in created/recreated OpenClaw cron payloads.
- `src/installer/gateway-api.ts`
  - Adds `toolsAllow` to cron job payload typing.
  - Passes `--tools exec,process,sessions_spawn` to the OpenClaw CLI fallback.
  - Uses `--timeout-seconds` for CLI fallback timeout.
  - Treats direct gateway HTTP `401` as fallbackable so the authenticated OpenClaw CLI path can create/recreate cron jobs.
  - Reads gateway token from config first, with `OPENCLAW_GATEWAY_TOKEN` as fallback.
- `tests/cron-payload-polling-model.test.ts`
  - Added regression coverage for workflow-level `polling.toolsAllow`.
  - Added regression coverage for per-agent `toolsAllow` override.

Installed workflow updated:

- `/Users/faisalshomemacmini/.openclaw/antfarm/workflows/adp-404-gateway-smoke-v1/workflow.yml`
  - Added workflow-level polling allowlist:

```yaml
polling:
  model: ollama-cloud/glm-5.1:cloud
  timeoutSeconds: 180
  toolsAllow:
    - exec
    - process
    - sessions_spawn
```

## Validation

Build:

```text
npm run build
PASS
```

Focused tests:

```text
node --test tests/cron-payload-polling-model.test.ts tests/gateway-password-auth.test.ts
tests 9
suites 2
pass 9
fail 0
duration_ms 117.834125
```

Workflow validation:

```text
node dist/cli/cli.js workflow validate adp-404-gateway-smoke-v1
PASS: Workflow "adp-404-gateway-smoke-v1" validation passed
```

Cron reconciliation:

```text
node dist/cli/cli.js workflow ensure-crons adp-404-gateway-smoke-v1
PASS: Recreated agent crons for workflow "adp-404-gateway-smoke-v1".
```

Active cron payload:

```json
{
  "id": "bb638d60-942b-4ebe-bf71-324b2b4054bd",
  "name": "antfarm/adp-404-gateway-smoke-v1/probe",
  "enabled": true,
  "payload": {
    "model": "ollama-cloud/glm-5.1:cloud",
    "timeoutSeconds": 180,
    "toolsAllow": ["exec", "process", "sessions_spawn"]
  }
}
```

## Autonomous Proof Run

Command:

```text
node dist/cli/cli.js workflow run adp-404-gateway-smoke-v1 "ADP-424 autonomous shell-tools proof - single probe only" --repo-path=/Users/faisalshomemacmini/.openclaw/workspace/antfarm --context repo_name=antfarm
```

Run:

- Run number: `445`
- Run ID: `ae82880e-7a26-495d-b6c4-7a0d2b456ea1`
- Workflow: `adp-404-gateway-smoke-v1`
- Task: `ADP-424 autonomous shell-tools proof - single probe only`
- Status: `completed`
- Created: `2026-05-25T22:20:28.176Z`
- Updated: `2026-05-25 22:22:22`

Step:

- Step DB ID: `2cedb99b-efb6-4927-a10e-125fb1b21e16`
- Step ID: `gateway-proof`
- Agent ID: `adp-404-gateway-smoke-v1_probe`
- Status: `done`
- Retry count: `1`
- Escalated model: `ollama-cloud/kimi-k2.6:cloud`
- Timeout minutes: `3`

Step output:

```text
SCORE: 100
ADP404_GATEWAY_PROOF: complete
PROOF_SCOPE: ADP-404
PROOF_TIMESTAMP: 2026-05-25T22:22:22Z
```

Execution log:

```text
05:20 PM  [ae82880e]  probe  Claimed step
05:20 PM  [ae82880e]  Run started
05:21 PM  [ae82880e]  probe  Claimed step
05:22 PM  [ae82880e]  Step timed out (Model escalated to ollama-cloud/kimi-k2.6:cloud on retry 1)
05:22 PM  [ae82880e]  Step completed
05:22 PM  [ae82880e]  Run completed
```

Caveat: the first attempt timed out and retried with model escalation. The retry completed autonomously through the isolated proof-agent path. NexDev did not complete the step through the local step API.

Event log evidence from `/Users/faisalshomemacmini/.openclaw/antfarm/events.jsonl`:

```text
9642 step.running  runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1 stepId=gateway-proof agentId=adp-404-gateway-smoke-v1_probe
9643 run.started   runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1
9644 step.running  runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1 stepId=gateway-proof agentId=adp-404-gateway-smoke-v1_probe
9645 step.timeout  runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1 detail="Model escalated to ollama-cloud/kimi-k2.6:cloud on retry 1"
9646 step.done     runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1 stepId=gateway-proof
9647 run.completed runId=ae82880e-7a26-495d-b6c4-7a0d2b456ea1 workflowId=adp-404-gateway-smoke-v1
```

## Factory Ledger Evidence

Rows recorded in `/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db`:

- `factory_items`: `adp424_item_1779747742`
- `factory_runs`: `adp424_run_1779747742`
- `factory_events`: `adp424_event_1779747742`
- `factory_system_events`: `adp424_system_1779747742`

Ledger chain:

```text
adp424_item_1779747742
  -> adp424_run_1779747742
       -> antfarm run ae82880e-7a26-495d-b6c4-7a0d2b456ea1 (#445)
  -> adp424_event_1779747742 proof_completed
adp424_system_1779747742 config_reload
```

## Acceptance Read

- Isolated proof-agent shell tools enabled: PASS
- Active cron carries `toolsAllow`: PASS
- Autonomous one-step proof rerun: PASS
- Step completed with `SCORE:` marker: PASS
- Event/log evidence recorded: PASS
- Factory ledger rows recorded: PASS

ADP-424 can move to Done.
