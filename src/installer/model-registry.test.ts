import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveModelFamily, validateWorkflowModels, type ModelRegistry } from "./model-registry.js";
import type { WorkflowSpec } from "./types.js";

const registry: ModelRegistry = {
  version: 1,
  policy: { unknown_model: "fail_validation", inactive_statuses: ["deprecated"] },
  families: {
    coding: {
      canonical: "provider/coder",
      aliases: ["coder"],
      status: "active",
      allowed_roles: ["coding"],
      allowed_workflow_stages: ["fix"],
    },
    polling: {
      canonical: "provider/poller",
      status: "active",
      allowed_roles: ["polling"],
      allowed_workflow_stages: ["polling"],
    },
    deprecated: {
      canonical: "provider/old",
      status: "deprecated",
      allowed_roles: ["coding"],
      allowed_workflow_stages: ["fix"],
    },
  },
};

function workflow(model: string): WorkflowSpec {
  return {
    id: "swarm-code-fix-v1",
    polling: { model: "provider/poller" },
    agents: [{
      id: "fix-backend",
      role: "coding",
      model,
      workspace: { baseDir: "agents/fix-backend", files: { "AGENTS.md": "agents/fix-backend/AGENTS.md" } },
    }],
    steps: [{ id: "fix", agent: "fix-backend", input: "Fix it", expects: "STATUS" }],
  };
}

describe("model registry validation", () => {
  it("resolves aliases to a registered model family", () => {
    const family = resolveModelFamily("coder", registry);
    assert.equal(family?.canonical, "provider/coder");
  });

  it("accepts a role and stage eligible model", () => {
    const result = validateWorkflowModels(workflow("provider/coder"), registry);
    assert.equal(result.valid, true);
  });

  it("rejects unknown model assignments", () => {
    const result = validateWorkflowModels(workflow("provider/mystery"), registry);
    assert.equal(result.valid, false);
    assert.match(result.errors[0].message, /Unknown model/);
  });

  it("rejects role-ineligible model assignments", () => {
    const result = validateWorkflowModels({
      ...workflow("provider/coder"),
      agents: [{ ...workflow("provider/coder").agents[0], role: "analysis" }],
    }, registry);
    assert.equal(result.valid, false);
    assert.match(result.errors[0].message, /not allowed for role/);
  });

  it("rejects inactive model assignments", () => {
    const result = validateWorkflowModels(workflow("provider/old"), registry);
    assert.equal(result.valid, false);
    assert.match(result.errors[0].message, /marked deprecated/);
  });

  it("validates legacy step-level model assignments", () => {
    const result = validateWorkflowModels({
      ...workflow("provider/coder"),
      steps: [{
        id: "legacy-step-model",
        agent: "fix-backend",
        input: "Fix it",
        expects: "STATUS",
        model: "provider/mystery",
      } as any],
    }, registry);
    assert.equal(result.valid, false);
    assert.match(result.errors[0].usage, /steps\.legacy-step-model\.model/);
    assert.match(result.errors[0].message, /Unknown model/);
  });
});
