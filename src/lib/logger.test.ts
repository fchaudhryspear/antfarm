import fs from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { log, logger, formatEntry, readRecentLogs } from "./logger.js";
import type { LogLevel } from "./logger.js";

const execFileAsync = promisify(execFile);

describe("logger", () => {
  let tempLogDir: string;
  let previousLogDir: string | undefined;

  beforeEach(async () => {
    previousLogDir = process.env.ANTFARM_LOG_DIR;
    tempLogDir = await mkdtemp(path.join(os.tmpdir(), "antfarm-logger-"));
    process.env.ANTFARM_LOG_DIR = tempLogDir;
  });

  afterEach(async () => {
    if (previousLogDir === undefined) {
      delete process.env.ANTFARM_LOG_DIR;
    } else {
      process.env.ANTFARM_LOG_DIR = previousLogDir;
    }
    await rm(tempLogDir, { recursive: true, force: true });
  });

  describe("log()", () => {
    it("is synchronous and returns void (not a Promise)", () => {
      const result = log("info", "test message");
      // Must return undefined (void), not a Promise
      assert.equal(result, undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.ok(
        !((result as any) instanceof Promise),
        "log() should not return a Promise"
      );
    });

    it("does not throw even with an invalid log path scenario", () => {
      // This should silently swallow any errors
      assert.doesNotThrow(() => {
        log("error", "test error message");
      });
    });

    it("accepts optional context parameter", () => {
      assert.doesNotThrow(() => {
        log("info", "with context", {
          workflowId: "wf-1",
          runId: "run-1",
          stepId: "step-1",
        });
      });
    });

    it("preserves an existing rotated log when rotating an oversized active log", () => {
      const logFile = path.join(tempLogDir, "workflow.log");
      const firstBackup = `${logFile}.1`;
      const secondBackup = `${logFile}.2`;
      const previousBackup = "previous backup\n";

      fs.writeFileSync(logFile, Buffer.alloc(5 * 1024 * 1024 + 1, "a"));
      fs.writeFileSync(firstBackup, previousBackup);

      log("info", "after rotation");

      assert.equal(fs.readFileSync(secondBackup, "utf-8"), previousBackup);
      assert.equal(fs.statSync(firstBackup).size, 5 * 1024 * 1024 + 1);
      assert.match(fs.readFileSync(logFile, "utf-8"), /\[INFO\] after rotation/);
    });

    it("preserves concurrent process log entries during rotation", async () => {
      const logFile = path.join(tempLogDir, "workflow.log");
      const loggerUrl = new URL("./logger.js", import.meta.url).href;

      fs.writeFileSync(logFile, Buffer.alloc(5 * 1024 * 1024 + 1, "a"));

      await Promise.all([
        execFileAsync(process.execPath, [
          "-e",
          `import(${JSON.stringify(loggerUrl)}).then(({ log }) => log("info", "concurrent one"))`,
        ], { env: { ...process.env, ANTFARM_LOG_DIR: tempLogDir } }),
        execFileAsync(process.execPath, [
          "-e",
          `import(${JSON.stringify(loggerUrl)}).then(({ log }) => log("info", "concurrent two"))`,
        ], { env: { ...process.env, ANTFARM_LOG_DIR: tempLogDir } }),
      ]);

      const combinedLogs = ["workflow.log", "workflow.log.1", "workflow.log.2"]
        .map(file => path.join(tempLogDir, file))
        .filter(file => fs.existsSync(file))
        .map(file => fs.readFileSync(file, "utf-8"))
        .join("\n");

      assert.match(combinedLogs, /\[INFO\] concurrent one/);
      assert.match(combinedLogs, /\[INFO\] concurrent two/);
    });
  });

  describe("formatEntry()", () => {
    it("formats a basic entry with timestamp and level", () => {
      const result = formatEntry({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        message: "hello world",
      });
      assert.equal(result, "2026-01-01T00:00:00.000Z [INFO] hello world");
    });

    it("includes workflowId when provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "warn",
        workflowId: "my-workflow",
        message: "warning msg",
      });
      assert.equal(
        result,
        "2026-01-01T00:00:00.000Z [WARN] [my-workflow] warning msg"
      );
    });

    it("includes runId (truncated to 8 chars) when provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "error",
        runId: "abcdef01-2345-6789-abcd-ef0123456789",
        message: "error msg",
      });
      assert.equal(
        result,
        "2026-01-01T00:00:00.000Z [ERROR] [abcdef01] error msg"
      );
    });

    it("includes stepId when provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "debug",
        stepId: "step-build",
        message: "debug msg",
      });
      assert.equal(
        result,
        "2026-01-01T00:00:00.000Z [DEBUG] [step-build] debug msg"
      );
    });

    it("includes all context fields in correct order", () => {
      const result = formatEntry({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        workflowId: "wf",
        runId: "12345678-xxxx",
        stepId: "step1",
        message: "full context",
      });
      assert.equal(
        result,
        "2026-01-01T00:00:00.000Z [INFO] [wf] [12345678] [step1] full context"
      );
    });
  });

  describe("logger object methods", () => {
    it("logger.info returns void (not a Promise)", () => {
      const result = logger.info("info test");
      assert.equal(result, undefined);
      assert.ok(!((result as any) instanceof Promise));
    });

    it("logger.warn returns void (not a Promise)", () => {
      const result = logger.warn("warn test");
      assert.equal(result, undefined);
      assert.ok(!((result as any) instanceof Promise));
    });

    it("logger.error returns void (not a Promise)", () => {
      const result = logger.error("error test");
      assert.equal(result, undefined);
      assert.ok(!((result as any) instanceof Promise));
    });

    it("logger.debug returns void (not a Promise)", () => {
      const result = logger.debug("debug test");
      assert.equal(result, undefined);
      assert.ok(!((result as any) instanceof Promise));
    });
  });

  describe("readRecentLogs()", () => {
    it("returns a Promise", () => {
      const result = readRecentLogs();
      assert.ok(result instanceof Promise, "readRecentLogs should return a Promise");
    });

    it("resolves to an array", async () => {
      const lines = await readRecentLogs();
      assert.ok(Array.isArray(lines));
    });
  });

  describe("exports", () => {
    it("exports log function", () => {
      assert.equal(typeof log, "function");
    });

    it("exports logger object with all methods", () => {
      assert.equal(typeof logger.info, "function");
      assert.equal(typeof logger.warn, "function");
      assert.equal(typeof logger.error, "function");
      assert.equal(typeof logger.debug, "function");
    });

    it("exports readRecentLogs function", () => {
      assert.equal(typeof readRecentLogs, "function");
    });
  });
});
