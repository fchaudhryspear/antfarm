import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const LOG_DIR = path.join(os.homedir(), ".openclaw", "antfarm", "logs");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const LOCK_RETRY_DELAY_MS = 10;
const STALE_LOCK_MS = 30_000;

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workflowId?: string;
  runId?: string;
  stepId?: string;
  message: string;
}

let readyLogDir: string | undefined;

function getLogDir(): string {
  return process.env.ANTFARM_LOG_DIR ?? LOG_DIR;
}

function getLogFile(): string {
  return path.join(getLogDir(), "workflow.log");
}

function getLockFile(): string {
  return path.join(getLogDir(), "workflow.log.lock");
}

function ensureLogDirSync(): void {
  const logDir = getLogDir();
  if (readyLogDir === logDir) return;
  fs.mkdirSync(logDir, { recursive: true });
  readyLogDir = logDir;
}

function rotateIfNeededSync(): void {
  try {
    const logFile = getLogFile();
    const stats = fs.statSync(logFile);
    if (stats.size > MAX_LOG_SIZE) {
      const firstBackup = `${logFile}.1`;
      const secondBackup = `${logFile}.2`;
      if (fs.existsSync(secondBackup)) {
        fs.unlinkSync(secondBackup);
      }
      if (fs.existsSync(firstBackup)) {
        fs.renameSync(firstBackup, secondBackup);
      }
      fs.renameSync(logFile, firstBackup);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLogLockSync(writeLog: () => void): void {
  const lockFile = getLockFile();
  let lockFd: number | undefined;

  while (lockFd === undefined) {
    try {
      lockFd = fs.openSync(lockFile, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
      try {
        const stats = fs.statSync(lockFile);
        if (Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
          fs.rmSync(lockFile, { force: true });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw statError;
        }
      }
      sleepSync(LOCK_RETRY_DELAY_MS);
    }
  }

  try {
    writeLog();
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockFile, { force: true });
  }
}

export function formatEntry(entry: LogEntry): string {
  const parts = [entry.timestamp, `[${entry.level.toUpperCase()}]`];

  if (entry.workflowId) {
    parts.push(`[${entry.workflowId}]`);
  }
  if (entry.runId) {
    parts.push(`[${entry.runId.slice(0, 8)}]`);
  }
  if (entry.stepId) {
    parts.push(`[${entry.stepId}]`);
  }

  parts.push(entry.message);
  return parts.join(" ");
}

export function log(
  level: LogLevel,
  message: string,
  context?: { workflowId?: string; runId?: string; stepId?: string }
): void {
  try {
    ensureLogDirSync();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    const line = formatEntry(entry) + "\n";
    withLogLockSync(() => {
      rotateIfNeededSync();
      fs.appendFileSync(getLogFile(), line, "utf-8");
    });
  } catch {
    // Logging must never throw into the caller
  }
}

export const logger = {
  info: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("info", msg, ctx),
  warn: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("warn", msg, ctx),
  error: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("error", msg, ctx),
  debug: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }): void =>
    log("debug", msg, ctx),
};

export async function readRecentLogs(lines: number = 50): Promise<string[]> {
  try {
    const content = await readFile(getLogFile(), "utf-8");
    const allLines = content.trim().split("\n");
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
