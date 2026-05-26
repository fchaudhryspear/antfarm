import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startDaemon, stopDaemon, getPidFile, getPortFile, getLogFile, isRunning, getDaemonStatus } from "./daemonctl.js";

let homeDir: string | null = null;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPath = process.env.PATH;
const originalStalePid = process.env.ANTFARM_STALE_PID;
const originalOpenSync = fs.openSync;
const originalCloseSync = fs.closeSync;

afterEach(() => {
  if (homeDir) {
    fs.rmSync(homeDir, { recursive: true, force: true });
    homeDir = null;
  }
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  process.env.PATH = originalPath;
  process.env.ANTFARM_STALE_PID = originalStalePid;
  fs.openSync = originalOpenSync;
  fs.closeSync = originalCloseSync;
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

function fakeNodeThatWritesOwnPid() {
  assert.ok(homeDir);
  const binDir = path.join(homeDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeNode = path.join(binDir, "node");
  fs.writeFileSync(fakeNode, [
    "#!/bin/sh",
    "mkdir -p \"$HOME/.openclaw/antfarm\"",
    "count_file=\"$HOME/.openclaw/antfarm/spawn-count\"",
    "count=0",
    "[ -f \"$count_file\" ] && count=$(cat \"$count_file\")",
    "printf '%s' \"$((count + 1))\" > \"$count_file\"",
    "printf '%s' \"$$\" > \"$HOME/.openclaw/antfarm/dashboard.pid\"",
    "printf '%s' \"$2\" > \"$HOME/.openclaw/antfarm/dashboard.port\"",
    "sleep 2",
  ].join("\n"));
  fs.chmodSync(fakeNode, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
}

async function waitForPidFile() {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (fs.existsSync(getPidFile())) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for pid file");
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

  it("closes parent log descriptors when startup fails", async () => {
    tempHome();
    fakeNodeThatWritesPid(process.pid);
    const openedLogFds: number[] = [];
    const closedFds: number[] = [];

    fs.openSync = ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const fd = originalOpenSync(file, flags, mode);
      if (String(file) === getLogFile()) {
        openedLogFds.push(fd);
      }
      return fd;
    }) as typeof fs.openSync;
    fs.closeSync = ((fd: number) => {
      closedFds.push(fd);
      return originalCloseSync(fd);
    }) as typeof fs.closeSync;

    await assert.rejects(
      () => startDaemon(3333),
      /Daemon failed to start/
    );
    assert.equal(openedLogFds.length, 2);
    assert.deepEqual(closedFds.filter((fd) => openedLogFds.includes(fd)).sort(), [...openedLogFds].sort());
  });

  it("serializes concurrent starts so a competing live pid file remains owned", async () => {
    tempHome();
    fakeNodeThatWritesOwnPid();

    const [first, second] = await Promise.all([
      startDaemon(3333),
      startDaemon(3333),
    ]);

    assert.ok(homeDir);
    const countFile = path.join(homeDir, ".openclaw", "antfarm", "spawn-count");
    assert.equal(fs.readFileSync(countFile, "utf-8"), "1");
    assert.equal(first.pid, second.pid);
    assert.deepEqual(isRunning(), { running: true, pid: first.pid });
  });

  it("reports the running daemon's actual port from status metadata", async () => {
    tempHome();
    fakeNodeThatWritesOwnPid();

    const first = await startDaemon(3333);
    const second = await startDaemon(4000);

    assert.equal(second.pid, first.pid);
    assert.equal(second.port, 3333);
    assert.deepEqual(getDaemonStatus(), { running: true, pid: first.pid, port: 3333 });
    assert.equal(fs.readFileSync(getPortFile(), "utf-8"), "3333");
  });

  it("can stop a daemon while startup confirmation is still pending", async () => {
    tempHome();
    fakeNodeThatWritesOwnPid();

    const starting = startDaemon(3333);
    await waitForPidFile();

    assert.equal(stopDaemon(), true);
    await assert.rejects(
      () => starting,
      /Daemon exited during startup/
    );
    assert.equal(fs.existsSync(getPidFile()), false);
    assert.deepEqual(isRunning(), { running: false });
  });
});
