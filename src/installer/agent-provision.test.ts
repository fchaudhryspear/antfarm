import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { provisionAgents } from "./agent-provision.js";
import type { WorkflowSpec } from "./types.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-agent-provision-"));
  tempDirs.push(dir);
  return dir;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function workflowWithWorkspace(workspace: WorkflowSpec["agents"][number]["workspace"]): WorkflowSpec {
  return {
    id: "safe-workflow",
    agents: [{ id: "developer", workspace }],
    steps: [],
  };
}

afterEach(async () => {
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("provisionAgents workspace path validation", () => {
  it("rejects workspace baseDir traversal outside the workflow workspace", async () => {
    const stateDir = await makeTempDir();
    const workflowDir = await makeTempDir();
    process.env.OPENCLAW_STATE_DIR = stateDir;
    await fs.writeFile(path.join(workflowDir, "AGENTS.md"), "test", "utf-8");

    await assert.rejects(
      provisionAgents({
        workflow: workflowWithWorkspace({
          baseDir: "../../escape",
          files: { "AGENTS.md": "AGENTS.md" },
        }),
        workflowDir,
        installSkill: false,
      }),
      /escapes managed workspace root/,
    );

    assert.equal(await pathExists(path.join(stateDir, "workspaces", "escape")), false);
  });

  it("rejects workspace file names that escape the agent workspace", async () => {
    const stateDir = await makeTempDir();
    const workflowDir = await makeTempDir();
    process.env.OPENCLAW_STATE_DIR = stateDir;
    await fs.writeFile(path.join(workflowDir, "AGENTS.md"), "test", "utf-8");

    await assert.rejects(
      provisionAgents({
        workflow: workflowWithWorkspace({
          baseDir: "developer",
          files: { "../AGENTS.md": "AGENTS.md" },
        }),
        workflowDir,
        installSkill: false,
      }),
      /escapes managed workspace root/,
    );

    assert.equal(
      await pathExists(path.join(stateDir, "workspaces", "workflows", "safe-workflow", "AGENTS.md")),
      false,
    );
  });
});
