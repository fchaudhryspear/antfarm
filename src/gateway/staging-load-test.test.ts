import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { resolveGatewayLoadTarget, runGatewayLoadTest } from "./staging-load-test.js";

describe("isolated staging gateway load test", () => {
  it("defines the absolute 5x target from the baseline", () => {
    assert.deepEqual(resolveGatewayLoadTarget({ baselineConcurrentSessions: 5 }), {
      baselineConcurrentSessions: 5,
      multiplier: 5,
      targetConcurrentSessions: 25,
    });
  });

  it("validates create, heartbeat, teardown, and stale heartbeat evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "antfarm-gateway-load-test-"));
    const evidencePath = path.join(dir, "evidence.json");
    const evidenceDbPath = path.join(dir, "evidence.db");

    const result = await runGatewayLoadTest({
      baselineConcurrentSessions: 2,
      targetConcurrentSessions: 4,
      sustainedSeconds: 0.25,
      heartbeatIntervalMs: 25,
      heartbeatTimeoutMs: 50,
      evidencePath,
      evidenceDbPath,
    });

    assert.equal(result.pass, true);
    assert.equal(result.environment.live_gateway_touched, false);
    assert.equal(result.lifecycle.created_sessions, 4);
    assert.equal(result.lifecycle.teardown_count, 4);
    assert.equal(result.lifecycle.active_sessions_after_teardown, 0);
    assert.equal(result.lifecycle.heartbeat_timeout_invariant_verified, true);
    assert.equal(result.stability.connection_drops, 0);

    const db = new DatabaseSync(evidenceDbPath);
    try {
      const row = db.prepare("SELECT * FROM gateway_load_test_runs WHERE issue_id = 'ADP-388'").get() as {
        target_concurrent_sessions: number;
        pass: number;
      };
      assert.equal(row.target_concurrent_sessions, 4);
      assert.equal(row.pass, 1);
    } finally {
      db.close();
    }
  });
});
