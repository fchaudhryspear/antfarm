import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAllStepsPresent, type Step } from "./validate-consolidate-inputs.js";

function step(overrides: Partial<Step>): Step {
  return {
    step_id: "security",
    agent_id: "agent",
    output: null,
    status: "completed",
    ...overrides,
  };
}

describe("checkAllStepsPresent", () => {
  it("blocks a critical step with non-empty output unless it completed", () => {
    const result = checkAllStepsPresent([
      step({
        step_id: "security",
        status: "failed",
        output: "Schema validation failed",
      }),
    ]);

    assert.equal(result.blocked, true);
    assert.deepEqual(result.criticalMissing, ["security"]);
  });

  it("does not warn for skipped non-critical steps", () => {
    const result = checkAllStepsPresent([
      step({
        step_id: "docs",
        status: "skipped",
        output: null,
      }),
    ]);

    assert.equal(result.blocked, false);
    assert.deepEqual(result.nonCriticalMissing, []);
  });
});
