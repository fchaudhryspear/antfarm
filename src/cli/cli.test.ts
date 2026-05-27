import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCrons } from "./cron-recovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..", "..");
const cliPath = join(__dirname, "..", "..", "dist", "cli", "cli.js");
const cliSourcePath = join(root, "src", "cli", "cli.ts");
const packagePath = join(root, "package.json");
const distPackagePath = join(root, "dist", "package.json");

describe("workflow stop CLI", () => {
  it("built CLI reports the package version", () => {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    assert.ok(existsSync(distPackagePath), "Build should copy package.json into dist");

    const output = execFileSync("node", [cliPath, "version"], { encoding: "utf-8" }).trim();

    assert.equal(output, `antfarm v${pkg.version}`);
  });

  it("help text includes 'workflow stop' command", () => {
    // Running with no args prints usage to stdout and exits with code 1
    let output: string;
    try {
      output = execFileSync("node", [cliPath], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: any) {
      // CLI exits with code 1 when no args — capture stdout from the error
      output = (err.stdout ?? "") + (err.stderr ?? "");
    }
    assert.ok(output.includes("workflow stop"), "Help text should include 'workflow stop'");
    assert.ok(output.includes("Stop/cancel a running workflow"), "Help text should include stop description");
  });

  it("'workflow stop' appears after 'workflow resume' in help text", () => {
    let output: string;
    try {
      output = execFileSync("node", [cliPath], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: any) {
      output = (err.stdout ?? "") + (err.stderr ?? "");
    }
    const resumeIndex = output.indexOf("workflow resume");
    const stopIndex = output.indexOf("workflow stop");
    assert.ok(resumeIndex !== -1, "Help text should include 'workflow resume'");
    assert.ok(stopIndex !== -1, "Help text should include 'workflow stop'");
    assert.ok(stopIndex > resumeIndex, "'workflow stop' should appear after 'workflow resume'");
  });

  it("'workflow stop' with no run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: any) {
      assert.equal(err.status, 1, "Should exit with code 1");
      assert.ok(
        (err.stderr ?? "").includes("Missing run-id"),
        "Should print 'Missing run-id' to stderr",
      );
    }
  });

  it("'workflow stop' with nonexistent run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop", "nonexistent-run-id-000"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: any) {
      assert.equal(err.status, 1, "Should exit with code 1");
      assert.ok(
        (err.stderr ?? "").length > 0,
        "Should print error to stderr",
      );
    }
  });
});

describe("CLI bootstrap", () => {
  it("declares the first Node.js release with node:sqlite support", () => {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    const source = readFileSync(cliSourcePath, "utf-8");

    assert.equal(pkg.engines.node, ">=22.13.0");
    assert.ok(source.includes("Node.js >= 22.13.0"), "bootstrap error should name the engine floor");
    assert.ok(source.includes("Node.js 22.13.0+"), "bootstrap fix should name the engine floor");
  });

  it("checks node:sqlite before loading sqlite-dependent command modules", () => {
    const source = readFileSync(cliSourcePath, "utf-8");
    const sqliteCheck = source.indexOf('await import("node:sqlite")');
    const commandImport = source.indexOf('await import("./cli-main.js")');

    assert.ok(sqliteCheck !== -1, "bootstrap should check node:sqlite availability");
    assert.ok(commandImport !== -1, "bootstrap should dynamically import the command implementation");
    assert.ok(sqliteCheck < commandImport, "node:sqlite check should happen before command implementation import");
    assert.equal(
      /^\s*import\s/m.test(source),
      false,
      "bootstrap should not have static imports that can evaluate before the runtime check",
    );
  });
});

describe("logs CLI", () => {
  it("resolves #N run selectors before generic run-id matching", () => {
    const home = mkdtempSync(join(tmpdir(), "antfarm-cli-logs-"));
    try {
      const antfarmDir = join(home, ".openclaw", "antfarm");
      mkdirSync(antfarmDir, { recursive: true });

      const runId = "run-logs-selector-test";
      const now = new Date("2026-05-26T12:00:00.000Z").toISOString();
      const db = new DatabaseSync(join(antfarmDir, "antfarm.db"));
      try {
        db.exec(`
          CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            run_number INTEGER,
            workflow_id TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '{}',
            notify_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        db.prepare(
          "INSERT INTO runs (id, run_number, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)"
        ).run(runId, 3, "test-workflow", "test task", "running", now, now);
      } finally {
        db.close();
      }

      writeFileSync(
        join(antfarmDir, "events.jsonl"),
        JSON.stringify({ ts: now, event: "run.started", runId, workflowId: "test-workflow" }) + "\n",
      );

      const output = execFileSync("node", [cliPath, "logs", "#3"], {
        encoding: "utf-8",
        env: { ...process.env, HOME: home },
      });
      assert.ok(output.includes("Run started"), output);
      assert.ok(!output.includes('No events found for run matching "#3"'), output);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("dashboard CLI", () => {
  it("prints the running daemon port instead of the requested port", () => {
    const home = mkdtempSync(join(tmpdir(), "antfarm-cli-dashboard-"));
    try {
      const antfarmDir = join(home, ".openclaw", "antfarm");
      mkdirSync(antfarmDir, { recursive: true });
      writeFileSync(join(antfarmDir, "dashboard.pid"), String(process.pid));
      writeFileSync(join(antfarmDir, "dashboard.port"), "3333");

      const output = execFileSync("node", [cliPath, "dashboard", "--port", "4000"], {
        encoding: "utf-8",
        env: { ...process.env, HOME: home },
      });

      assert.ok(output.includes("Dashboard already running"), output);
      assert.ok(output.includes("http://localhost:3333"), output);
      assert.ok(!output.includes("http://localhost:4000"), output);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("cron-recovery CLI", () => {
  it("reports workflow cron sets that were already present", async () => {
    let ensureCalls = 0;

    const result = await recoverCrons(false, {
      getActiveRuns: () => [{
        id: "run-cron-recovery-test",
        workflow_id: "test-workflow",
        status: "running",
        task: "recover crons",
        updated_at: new Date("2026-05-26T12:00:00.000Z").toISOString(),
      }],
      resolveWorkflowDir: () => "/unused",
      loadWorkflowSpec: async () => ({
        id: "test-workflow",
        agents: [
          { id: "lead", workspace: { baseDir: "/unused", files: {} } },
          { id: "developer", workspace: { baseDir: "/unused", files: {} } },
        ],
        steps: [],
      }),
      listCronJobs: async () => ({
        jobs: [
          { name: "antfarm/test-workflow/lead" },
          { name: "antfarm/test-workflow/developer" },
        ],
      }),
      ensureWorkflowCrons: async () => {
        ensureCalls++;
      },
      log: () => {},
    });

    assert.equal(ensureCalls, 1);
    assert.equal(result.alreadyPresent, 1);
    assert.equal(result.registered, 0);
    assert.deepEqual(result.errors, []);
  });

  it("reads active runs without requiring the sqlite3 executable", () => {
    const home = mkdtempSync(join(tmpdir(), "antfarm-cli-cron-"));
    const emptyPath = join(home, "empty-bin");
    try {
      mkdirSync(emptyPath);
      const antfarmDir = join(home, ".openclaw", "antfarm");
      mkdirSync(antfarmDir, { recursive: true });

      const now = new Date("2026-05-26T12:00:00.000Z").toISOString();
      const db = new DatabaseSync(join(antfarmDir, "antfarm.db"));
      try {
        db.exec(`
          CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            context TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        db.prepare(
          "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)"
        ).run("run-cron-recovery-test", "test-workflow", "recover crons", "running", now, now);
      } finally {
        db.close();
      }

      const output = execFileSync(process.execPath, [cliPath, "cron-recovery", "--dry-run"], {
        encoding: "utf-8",
        env: { ...process.env, HOME: home, PATH: emptyPath },
      });

      assert.ok(output.includes("Found 1 active run(s)"), output);
      assert.ok(output.includes("test-workflow"), output);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
