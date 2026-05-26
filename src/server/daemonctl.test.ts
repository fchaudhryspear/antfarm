import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startDaemon, getPidFile, isRunning } from "./daemonctl.js";

let homeDir: string | null = null;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPath = process.env.PATH;
const originalStalePid = process.env.ANTFARM_STALE_PID;

afterEach(() => {
  if (homeDir) {
    fs.rmSync(homeDir, { recursive: true, force: true });
    homeDir = null;
  }
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  process.env.PATH = originalPath;
  process.env.ANTFARM_STALE_PID = originalStalePid;
});

function tempHome() {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-daemonctl-"));
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
}

function fakeNodeThatWritesPid(pid: number) {
  assert.ok(homeDir);
  const binDir = path.join(homeDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeNode = path.join(binDir, "node");
  fs.writeFileSync(fakeNode, [
    "#!/bin/sh",
    "mkdir -p \"$HOME/.openclaw/antfarm\"",
    "printf '%s' \"$ANTFARM_STALE_PID\" > \"$HOME/.openclaw/antfarm/dashboard.pid\"",
    "sleep 2",
  ].join("\n"));
  fs.chmodSync(fakeNode, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
  process.env.ANTFARM_STALE_PID = String(pid);
}

describe("daemon startup", () => {
  it("rejects and clears a live pid file that does not belong to the spawned child", async () => {
    tempHome();
    fakeNodeThatWritesPid(process.pid);

    await assert.rejects(
      () => startDaemon(3333),
      /Daemon failed to start/
    );
    assert.equal(fs.existsSync(getPidFile()), false);
    assert.deepEqual(isRunning(), { running: false });
  });
});
