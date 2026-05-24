# ADP-388 Gateway 5x Load Test and Concurrency Cap Policy

## Scope

ADP-388 validates the RFC §13 gateway hard gate without touching the live
OpenClaw gateway on port `18789`. The test starts an isolated loopback staging
gateway on an ephemeral port, exercises session lifecycle operations, and writes
evidence into a `gateway_load_test_runs` SQLite table plus a JSON artifact.

## Target

Current safe peak is defined as the existing immediate gateway dispatch cap:
`ANTFARM_MAX_IMMEDIATE_GATEWAY_SPAWNS=5` by default.

The required 5x target is therefore:

```text
baseline_current_concurrent_sessions = 5
target_concurrent_sessions = 25
```

## Validation Command

```bash
npm run build
node --test dist/gateway/staging-load-test.test.js
node scripts/gateway-staging-load-test.mjs \
  --baseline 5 \
  --multiplier 5 \
  --sustained-seconds 10 \
  --heartbeat-interval-ms 100 \
  --heartbeat-timeout-ms 500 \
  --max-parallel-units 25 \
  --evidence docs/evidence/adp-388-gateway-load-test.json \
  --evidence-db /tmp/antfarm-adp388-gateway-load-test.db
```

## Acceptance Mapping

- Absolute 5x target: `target.baseline_concurrent_sessions` and
  `target.target_concurrent_sessions` in the JSON evidence.
- Separate staging gateway: `environment.kind: isolated_staging`,
  `live_gateway_touched: false`, `production_sessions_touched: false`.
- Sustained load: `lifecycle.created_sessions` equals the target and
  `stability.connection_drops` is `0`.
- Session lifecycle: create, heartbeat, and teardown counts are captured.
- Heartbeat timeout invariant: `heartbeat_timeout_invariant_verified: true`.
- LaunchAgent stability: approximated for the isolated harness through process
  RSS sampling and failure tracking. Live LaunchAgent validation still requires
  explicit approval before a non-staging test.
- Concurrency cap: if staging passes, prototype scope may use
  `max_parallel_units=25`; if it fails, the evidence records a lower cap based
  on successful lifecycle completion.

## Policy

For the M6 prototype, set `max_parallel_units` no higher than the recorded
`cap_policy.max_parallel_units`. Do not run live gateway load tests without
explicit Faisal approval, a rollback plan, a maintenance window, and a
post-test ledger sanity check.
