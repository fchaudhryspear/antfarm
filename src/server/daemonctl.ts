import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getPidFile(): string {
  return path.join(os.homedir(), ".openclaw", "antfarm", "dashboard.pid");
}

export function getLogFile(): string {
  return path.join(os.homedir(), ".openclaw", "antfarm", "dashboard.log");
}

function getLockFile(): string {
  return path.join(os.homedir(), ".openclaw", "antfarm", "dashboard.start.lock");
}

export function isRunning(): { running: true; pid: number } | { running: false } {
  const pidFile = getPidFile();
  if (!fs.existsSync(pidFile)) return { running: false };
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  if (isNaN(pid)) return { running: false };
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    // Stale PID file
    try { fs.unlinkSync(pidFile); } catch {}
    return { running: false };
  }
}

function readPidFile(): number | null {
  const pidFile = getPidFile();
  if (!fs.existsSync(pidFile)) return null;
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  return isNaN(pid) ? null : pid;
}

function closeFd(fd: number | null): null {
  if (fd !== null) {
    fs.closeSync(fd);
  }
  return null;
}

async function acquireStartLock(): Promise<number> {
  const lockFile = getLockFile();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      return fs.openSync(lockFile, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try { fs.unlinkSync(lockFile); } catch {}
  return fs.openSync(lockFile, "wx");
}

export async function startDaemon(port = 3333): Promise<{ pid: number; port: number }> {
  const status = isRunning();
  if (status.running) {
    return { pid: status.pid, port };
  }

  const logFile = getLogFile();
  const pidDir = path.dirname(getPidFile());
  fs.mkdirSync(pidDir, { recursive: true });

  const lockFd = await acquireStartLock();
  try {
    const lockedStatus = isRunning();
    if (lockedStatus.running) {
      return { pid: lockedStatus.pid, port };
    }

    let out: number | null = null;
    let err: number | null = null;
    let child;
    try {
      out = fs.openSync(logFile, "a");
      err = fs.openSync(logFile, "a");

      const daemonScript = path.resolve(__dirname, "daemon.js");
      child = spawn("node", [daemonScript, String(port)], {
        detached: true,
        stdio: ["ignore", out, err],
      });
    } finally {
      err = closeFd(err);
      out = closeFd(out);
    }
    child.unref();

    let startupFailure: Error | null = null;
    const onError = (error: Error) => {
      startupFailure = error;
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      startupFailure = new Error(`Daemon exited during startup (${signal ?? code ?? "unknown"}). Check ${logFile}`);
    };
    child.once("error", onError);
    child.once("exit", onExit);

    // Wait 1s then confirm
    await new Promise((r) => setTimeout(r, 1000));
    child.off("error", onError);
    child.off("exit", onExit);

    if (startupFailure) {
      const pid = readPidFile();
      if (child.pid && pid === child.pid) {
        try { fs.unlinkSync(getPidFile()); } catch {}
      }
      throw startupFailure;
    }

    const pid = readPidFile();
    if (!child.pid || pid !== child.pid) {
      if (pid !== null) {
        try { fs.unlinkSync(getPidFile()); } catch {}
      }
      throw new Error("Daemon failed to start. Check " + logFile);
    }

    const check = isRunning();
    if (!check.running) {
      throw new Error("Daemon failed to start. Check " + logFile);
    }
    return { pid: check.pid, port };
  } finally {
    try { fs.closeSync(lockFd); } catch {}
    try { fs.unlinkSync(getLockFile()); } catch {}
  }
}

export function stopDaemon(): boolean {
  const status = isRunning();
  if (!status.running) return false;
  try {
    process.kill(status.pid, "SIGTERM");
  } catch {}
  try { fs.unlinkSync(getPidFile()); } catch {}
  return true;
}

export function getDaemonStatus(): { running: boolean; pid?: number; port?: number } | null {
  const status = isRunning();
  if (!status.running) return { running: false };
  return { running: true, pid: status.pid };
}
