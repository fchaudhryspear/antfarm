import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildForcedTierOutput, normalizeForcedTier, parseOutputKeyValues } from "./step-ops.js";
import { validateContractAndDispatch } from "../validate-step-output.js";

describe("force tier helpers", () => {
  it("normalizes only supported tier overrides", () => {
    assert.equal(normalizeForcedTier(" 1 "), "1");
    assert.equal(normalizeForcedTier("2"), "2");
    assert.equal(normalizeForcedTier("3"), "3");
    assert.equal(normalizeForcedTier("4"), null);
    assert.equal(normalizeForcedTier(""), null);
  });

  it("builds a contract-compliant forced tier response", () => {
    const output = buildForcedTierOutput("2");
    assert.equal(output.includes("TIER: 2"), true);
    assert.equal(output.includes("TIER_LABEL: standard"), true);
    assert.equal(output.includes("SKIP_PHASES: architecture,release"), true);
    assert.equal(validateContractAndDispatch(output, "TIER:").valid, true);
  });
});

describe("parseOutputKeyValues", () => {
  it("normalizes lowercase keys and preserves dispatch status details", () => {
    const parsed = parseOutputKeyValues("swarm_status: running (dispatched swarm-implement-v1 #437)\nstatus: done");
    assert.equal(parsed.SWARM_STATUS, "running (dispatched swarm-implement-v1 #437)");
    assert.equal(parsed.STATUS, "done");
  });
});
