import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { fetchWorkflow } from "./workflow-fetch.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-fetch-"));
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
  mock.restoreAll();
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("fetchWorkflow replacement safety", () => {
  it("keeps an existing installed workflow when replacement copy fails", async () => {
    const stateDir = await makeTempDir();
    process.env.OPENCLAW_STATE_DIR = stateDir;
    const destination = path.join(stateDir, "antfarm", "workflows", "smoke-test-v1");
    await fs.mkdir(destination, { recursive: true });
    await fs.writeFile(path.join(destination, "workflow.yml"), "id: installed-workflow\n", "utf-8");
    await fs.writeFile(path.join(destination, "local.txt"), "keep me\n", "utf-8");

    mock.method(fs, "cp", async () => {
      throw new Error("simulated copy failure");
    });

    await assert.rejects(fetchWorkflow("smoke-test-v1"), /simulated copy failure/);

    assert.equal(await fs.readFile(path.join(destination, "workflow.yml"), "utf-8"), "id: installed-workflow\n");
    assert.equal(await fs.readFile(path.join(destination, "local.txt"), "utf-8"), "keep me\n");
    assert.equal(await pathExists(destination), true);
  });
});
