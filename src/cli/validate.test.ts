import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateWorkflowDefinition } from "./validate.js";

describe("validateWorkflowDefinition dependency graph", () => {
  it("accepts a valid fan-out/fan-in DAG", () => {
    const result = validateWorkflowDefinition({
      id: "test-dag",
      name: "Test DAG",
      steps: [
        { id: "preflight", agent: "a" },
        { id: "review-a", agent: "b", depends_on: ["preflight"] },
        { id: "review-b", agent: "c", depends_on: ["preflight"] },
        { id: "consolidate", agent: "d", depends_on: ["review-a", "review-b"] },
      ],
    });
    assert.equal(result.valid, true);
  });

  it("rejects a missing dependency reference", () => {
    const result = validateWorkflowDefinition({
      id: "test-missing-dep",
      name: "Test Missing Dep",
      steps: [
        { id: "review", agent: "a", depends_on: ["preflight"] },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.message.includes("depends on missing step")));
  });

  it("rejects circular dependencies", () => {
    const result = validateWorkflowDefinition({
      id: "test-cycle",
      name: "Test Cycle",
      steps: [
        { id: "a", agent: "a", depends_on: ["b"] },
        { id: "b", agent: "b", depends_on: ["a"] },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.message.includes("Circular dependency")));
  });
});
