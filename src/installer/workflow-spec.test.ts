import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadWorkflowSpec } from "./workflow-spec.js";

const originalModelRegistry = process.env.ANTFARM_MODEL_REGISTRY;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-spec-"));
  tempDirs.push(dir);
  return dir;
}

async function writeMinimalModelRegistry(dir: string): Promise<void> {
  const registryPath = path.join(dir, "model_registry.yaml");
  await fs.writeFile(registryPath, "version: 1\nfamilies: {}\n", "utf-8");
  process.env.ANTFARM_MODEL_REGISTRY = registryPath;
}

afterEach(async () => {
  if (originalModelRegistry === undefined) {
    delete process.env.ANTFARM_MODEL_REGISTRY;
  } else {
    process.env.ANTFARM_MODEL_REGISTRY = originalModelRegistry;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("loadWorkflowSpec", () => {
  it("rejects steps assigned to undeclared agents", async () => {
    const workflowDir = await makeTempDir();
    await writeMinimalModelRegistry(workflowDir);
    await fs.writeFile(
      path.join(workflowDir, "workflow.yml"),
      [
        "id: test-workflow",
        "agents:",
        "  - id: developer",
        "    workspace:",
        "      baseDir: developer",
        "      files:",
        "        AGENTS.md: AGENTS.md",
        "steps:",
        "  - id: implement",
        "    agent: missing-agent",
        "    input: Fix it",
        "    expects: STATUS",
        "",
      ].join("\n"),
      "utf-8",
    );

    await assert.rejects(
      loadWorkflowSpec(workflowDir),
      /workflow\.yml step "implement" references unknown agent "missing-agent"/,
    );
  });
});
