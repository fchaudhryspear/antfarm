import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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

  it("enforces maxParallelUnits across lifecycle requests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "antfarm-gateway-load-test-"));
    const evidencePath = path.join(dir, "evidence.json");
    const evidenceDbPath = path.join(dir, "evidence.db");
    const originalFetch = globalThis.fetch;
    let inFlight = 0;
    let maxInFlight = 0;

    globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const input = args[0];
      const url = input instanceof Request ? input.url : input.toString();
      const method = (input instanceof Request ? input.method : args[1]?.method) ?? "GET";
      const { pathname } = new URL(url);
      const isLifecycleRequest =
        (method === "POST" && pathname === "/sessions") ||
        (method === "POST" && /^\/sessions\/[^/]+\/heartbeat$/.test(pathname)) ||
        (method === "DELETE" && /^\/sessions\/[^/]+$/.test(pathname));

      if (!isLifecycleRequest) return await originalFetch(...args);

      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await originalFetch(...args);
      } finally {
        inFlight -= 1;
      }
    }) as typeof fetch;

    try {
      const result = await runGatewayLoadTest({
        targetConcurrentSessions: 5,
        maxParallelUnits: 2,
        sustainedSeconds: 0.1,
        heartbeatIntervalMs: 10,
        heartbeatTimeoutMs: 60,
        evidencePath,
        evidenceDbPath,
      });

      assert.equal(result.pass, true);
      assert.equal(result.cap_policy.max_parallel_units, 2);
      assert.equal(result.lifecycle.created_sessions, 5);
      assert.equal(result.lifecycle.teardown_count, 5);
      assert.ok(maxInFlight <= 2, `expected at most 2 in-flight lifecycle requests, saw ${maxInFlight}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("records failure evidence when session creation fails", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "antfarm-gateway-load-test-"));
    const evidencePath = path.join(dir, "evidence.json");
    const evidenceDbPath = path.join(dir, "evidence.db");
    const originalFetch = globalThis.fetch;
    let failedCreate = false;

    globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const input = args[0];
      const url = input instanceof Request ? input.url : input.toString();
      const method = (input instanceof Request ? input.method : args[1]?.method) ?? "GET";
      const { pathname } = new URL(url);

      if (!failedCreate && method === "POST" && pathname === "/sessions") {
        failedCreate = true;
        return new Response(JSON.stringify({ error: "capacity_exhausted" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return await originalFetch(...args);
    }) as typeof fetch;

    try {
      const result = await runGatewayLoadTest({
        targetConcurrentSessions: 3,
        sustainedSeconds: 0.1,
        heartbeatIntervalMs: 10,
        heartbeatTimeoutMs: 60,
        evidencePath,
        evidenceDbPath,
      });

      assert.equal(result.pass, false);
      assert.equal(result.lifecycle.created_sessions, 2);
      assert.equal(result.lifecycle.teardown_count, 2);
      assert.equal(result.stability.failed_requests, 1);
      assert.equal(result.stability.connection_drops, 1);
      assert.ok(result.blockers.includes("created session count 2 did not match target 3"));

      const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as typeof result;
      assert.equal(evidence.pass, false);
      assert.equal(evidence.lifecycle.created_sessions, 2);

      const db = new DatabaseSync(evidenceDbPath);
      try {
        const row = db.prepare("SELECT created_sessions, pass FROM gateway_load_test_runs WHERE id = ?").get(result.run_id) as {
          created_sessions: number;
          pass: number;
        };
        assert.equal(row.created_sessions, 2);
        assert.equal(row.pass, 0);
      } finally {
        db.close();
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
