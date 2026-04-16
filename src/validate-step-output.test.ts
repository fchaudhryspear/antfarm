import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExpects, validateContractAndDispatch, validateStepOutput } from "./validate-step-output.js";

describe("validateContractAndDispatch", () => {
  it("normalizes expects keys with trailing colons", () => {
    assert.deepEqual(parseExpects("TIER:, SCORE:"), ["TIER", "SCORE"]);
  });

  it("accepts expected keys case-insensitively", () => {
    const result = validateContractAndDispatch("tier: 2", "TIER:");
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
