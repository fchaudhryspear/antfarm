import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExpects, validateContractAndDispatch, validateStepOutput } from "./validate-step-output.js";

describe("validateContractAndDispatch", () => {
  it("normalizes expects keys with trailing colons", () => {
    assert.deepEqual(parseExpects("TIER:, SCORE:"), ["TIER", "SCORE"]);
  });

  it("normalizes expects keys that include example values", () => {
    assert.deepEqual(parseExpects("STATUS: done"), ["STATUS"]);
  });

  it("accepts expected keys case-insensitively", () => {
    const result = validateContractAndDispatch("tier: 2", "TIER:");
    assert.equal(result.valid, true);
  });

  it("allows dispatch polling output before the final done key exists", () => {
    const result = validateContractAndDispatch(
      "SWARM_STATUS: running (dispatched swarm-implement-v1 #437)",
      "IMPLEMENTATION_DONE:",
      true,
    );
    assert.equal(result.valid, true);
  });

  it("accepts expected keys inside fenced markdown blocks", () => {
    const result = validateContractAndDispatch("```text\nTIER: 2\n```", "TIER:");
    assert.equal(result.valid, true);
  });

  it("does not apply the review schema to unrelated agents", () => {
    const result = validateStepOutput("TIER: 2", "pipeline-orchestrator_complexity-assessor");
    assert.equal(result.valid, true);
  });
});
