import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, "workflows");

const DISALLOWED_WORKFLOW_KEYS = [
  "dependsOn",
  "maxRetries",
  "onFail",
  "timeout_seconds",
  "timeoutMinutes",
  "polling_model",
  "base_dir",
];

function workflowFiles(): string[] {
  return fs.readdirSync(WORKFLOWS_DIR)
    .map((name) => path.join(WORKFLOWS_DIR, name, "workflow.yml"))
    .filter((file) => fs.existsSync(file));
}

describe("workflow key casing audit", () => {
  it("rejects legacy casing variants in workflow.yml files", () => {
    const violations: string[] = [];
    for (const file of workflowFiles()) {
      const content = fs.readFileSync(file, "utf-8");
      for (const key of DISALLOWED_WORKFLOW_KEYS) {
        const keyPattern = new RegExp(`(^|\\n)\\s*${key}:`);
        if (keyPattern.test(content)) {
          violations.push(`${path.relative(REPO_ROOT, file)} uses ${key}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
