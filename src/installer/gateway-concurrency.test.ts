import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS,
  resolveImmediateGatewaySpawnCap,
  selectImmediateDispatchAgents,
} from "./gateway-concurrency.js";

describe("gateway concurrency policy", () => {
  it("defaults to five immediate spawns", () => {
    assert.equal(resolveImmediateGatewaySpawnCap({}), DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS);
  });

  it("deduplicates and caps immediate dispatch", () => {
    const result = selectImmediateDispatchAgents(["a", "b", "a", "c", "d"], 2);
    assert.deepEqual(result.selected, ["a", "b"]);
    assert.deepEqual(result.deferred, ["c", "d"]);
  });

  it("uses the environment override when valid", () => {
    assert.equal(resolveImmediateGatewaySpawnCap({ ANTFARM_MAX_IMMEDIATE_GATEWAY_SPAWNS: "8" }), 8);
  });

  it("falls back for invalid overrides", () => {
    assert.equal(resolveImmediateGatewaySpawnCap({ ANTFARM_MAX_IMMEDIATE_GATEWAY_SPAWNS: "0" }), DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS);
    assert.equal(resolveImmediateGatewaySpawnCap({ ANTFARM_MAX_IMMEDIATE_GATEWAY_SPAWNS: "abc" }), DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS);
  });
});
