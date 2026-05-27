import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  resolveBundledWorkflowDir,
  resolveBundledWorkflowsDir,
  resolveWorkflowDir,
  resolveWorkflowRoot,
  resolveWorkflowWorkspaceDir,
  resolveWorkflowWorkspaceRoot,
} from "./paths.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;

afterEach(() => {
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
});

describe("workflow path resolution", () => {
  it("resolves safe workflow identifiers under managed roots", () => {
    process.env.OPENCLAW_STATE_DIR = "/tmp/antfarm-paths-test";

    assert.equal(
      resolveBundledWorkflowDir("swarm-code-fix-v1"),
      path.join(resolveBundledWorkflowsDir(), "swarm-code-fix-v1"),
    );
    assert.equal(
      resolveWorkflowDir("swarm-code-fix-v1"),
      path.join(resolveWorkflowRoot(), "swarm-code-fix-v1"),
    );
    assert.equal(
      resolveWorkflowWorkspaceDir("swarm-code-fix-v1"),
      path.join(resolveWorkflowWorkspaceRoot(), "swarm-code-fix-v1"),
    );
  });

  it("rejects traversal and absolute workflow identifiers before joining paths", () => {
    process.env.OPENCLAW_STATE_DIR = "/tmp/antfarm-paths-test";
    const invalidIds = ["../escape", "/tmp/escape", "", ".", "..", "nested/workflow", "nested\\workflow"];

    for (const workflowId of invalidIds) {
      assert.throws(() => resolveBundledWorkflowDir(workflowId), /Invalid workflow id/);
      assert.throws(() => resolveWorkflowDir(workflowId), /Invalid workflow id/);
      assert.throws(() => resolveWorkflowWorkspaceDir(workflowId), /Invalid workflow id/);
    }
  });
});
