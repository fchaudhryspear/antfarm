import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  removeManagedAgentParents,
  selectAntfarmManagedAgents,
  sessionMaintenanceMatchesDefaults,
} from "./uninstall.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-uninstall-"));
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

afterEach(async () => {
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("selectAntfarmManagedAgents", () => {
  it("removes only workflow-prefixed agents for known Antfarm workflow ids", () => {
    const workspaceRoot = path.join("/tmp", "openclaw", "workspaces", "workflows");
    const agents = [
      { id: "main", workspace: "/tmp/openclaw/workspaces/main" },
      { id: "feature-dev_planner", workspace: path.join(workspaceRoot, "feature-dev", "planner") },
      { id: "acme/dev", workspace: "/srv/acme/workspaces/dev" },
      { id: "other/qa", workspace: "/srv/other/workspaces/qa" },
    ] as Array<Record<string, unknown>>;

    const selected = selectAntfarmManagedAgents(agents, ["feature-dev"], workspaceRoot);
    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["feature-dev_planner"],
    );
  });

  it("falls back to workspace location for partially-corrupt Antfarm state", () => {
    const workspaceRoot = path.join("/tmp", "openclaw", "workspaces", "workflows");
    const agents = [
      { id: "bug-fix_fixer", workspace: path.join(workspaceRoot, "bug-fix", "fixer") },
      { id: "thirdparty/coder", workspace: path.join(workspaceRoot, "bug-fix", "outside") },
      { id: "main", workspace: "/tmp/openclaw/workspaces/main" },
    ] as Array<Record<string, unknown>>;

    const selected = selectAntfarmManagedAgents(agents, [], workspaceRoot);
    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["bug-fix_fixer"],
    );
  });
});

describe("removeManagedAgentParents", () => {
  it("does not remove parent directories from corrupt agentDir values outside Antfarm agents", async () => {
    const stateDir = await makeTempDir();
    const externalDir = await makeTempDir();
    const externalParent = path.join(externalDir, "important");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    await fs.mkdir(path.join(externalParent, "agent"), { recursive: true });
    await fs.writeFile(path.join(externalParent, "keep.txt"), "keep", "utf-8");

    await removeManagedAgentParents([
      { id: "demo_victim", agentDir: path.join(externalParent, "agent") },
    ]);

    assert.equal(await pathExists(externalParent), true);
    assert.equal(await pathExists(path.join(externalParent, "keep.txt")), true);
  });

  it("removes only the expected managed parent directory for the agent id", async () => {
    const stateDir = await makeTempDir();
    process.env.OPENCLAW_STATE_DIR = stateDir;
    const managedParent = path.join(stateDir, "agents", "demo_worker");
    await fs.mkdir(path.join(managedParent, "agent"), { recursive: true });
    await fs.mkdir(path.join(managedParent, "sessions"), { recursive: true });

    await removeManagedAgentParents([
      { id: "demo_worker", agentDir: path.join(managedParent, "agent") },
    ]);

    assert.equal(await pathExists(managedParent), false);
  });
});

describe("uninstall session maintenance cleanup", () => {
  it("does not treat a custom pruneAfter value as Antfarm defaults", () => {
    assert.equal(
      sessionMaintenanceMatchesDefaults({
        mode: "enforce",
        pruneAfter: "30d",
        maxEntries: 500,
        rotateBytes: "10mb",
      }),
      false,
    );
  });

  it("recognizes current and legacy Antfarm default prune settings", () => {
    assert.equal(
      sessionMaintenanceMatchesDefaults({
        mode: "enforce",
        pruneAfter: "7d",
        maxEntries: 500,
        rotateBytes: "10mb",
      }),
      true,
    );
    assert.equal(
      sessionMaintenanceMatchesDefaults({
        mode: "enforce",
        pruneDays: 7,
        maxEntries: 500,
        rotateBytes: "10mb",
      }),
      true,
    );
  });
});
