import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalCliFallback = process.env.ANTFARM_DISABLE_OPENCLAW_CLI_FALLBACK;

process.env.ANTFARM_DISABLE_OPENCLAW_CLI_FALLBACK = "1";

process.on("exit", () => {
  if (originalCliFallback === undefined) {
    delete process.env.ANTFARM_DISABLE_OPENCLAW_CLI_FALLBACK;
  } else {
    process.env.ANTFARM_DISABLE_OPENCLAW_CLI_FALLBACK = originalCliFallback;
  }
});

describe("runMedicCheck", () => {
  it("completes zombie runs when every step is done", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-medic-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const { getDb } = await import("../db.js");
    const { runMedicCheck } = await import("./medic.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'done-step', 'agent', 0, '', '', 'done', ?, ?)"
    ).run(crypto.randomUUID(), runId, t, t);
    const activeRunId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'active task', 'running', '{}', ?, ?)"
    ).run(activeRunId, t, t);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'pending-step', 'agent', 1, '', '', 'pending', ?, ?)"
    ).run(crypto.randomUUID(), activeRunId, t, t);

    const result = await runMedicCheck();

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "completed");
    assert.equal(result.findings[0]?.action, "complete_run");
    assert.equal(result.findings[0]?.remediated, true);

    const eventsPath = path.join(home, ".openclaw", "antfarm", "events.jsonl");
    const events = fs.readFileSync(eventsPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.some((event) => event.event === "run.completed" && event.runId === runId), true);
    assert.equal(events.some((event) => event.event === "run.failed" && event.runId === runId), false);
  });

  it("fails sibling active steps when an abandoned step reaches the hard limit", async () => {
    const { getDb } = await import("../db.js");
    const { runMedicCheck } = await import("./medic.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const abandonedStepId = crypto.randomUUID();
    const pendingStepId = crypto.randomUUID();
    const runningStepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'abandoned task', 'running', '{}', ?, ?)"
    ).run(runId, now, stale);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, abandoned_count, created_at, updated_at) VALUES (?, ?, 'abandoned-step', 'agent', 0, '', '', 'running', NULL, 4, ?, ?)"
    ).run(abandonedStepId, runId, now, stale);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'pending-sibling', 'agent', 1, '', '', 'pending', ?, ?)"
    ).run(pendingStepId, runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'running-sibling', 'agent', 2, '', '', 'running', ?, ?)"
    ).run(runningStepId, runId, now, now);

    const result = await runMedicCheck();

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    const steps = db.prepare(
      "SELECT id, status, output, abandoned_count FROM steps WHERE run_id = ? ORDER BY step_index"
    ).all(runId) as Array<{ id: string; status: string; output: string | null; abandoned_count: number }>;
    const finding = result.findings.find((item) => item.stepId === abandonedStepId);

    assert.equal(run.status, "failed");
    assert.deepEqual(steps.map((step) => step.status), ["failed", "failed", "failed"]);
    assert.equal(steps[0].output, "Medic: abandoned too many times");
    assert.equal(steps[0].abandoned_count, 5);
    assert.equal(steps[1].output, "Medic: run failed after step abandoned too many times");
    assert.equal(steps[2].output, "Medic: run failed after step abandoned too many times");
    assert.equal(finding?.action, "reset_step");
    assert.equal(finding?.remediated, true);
  });

  it("does not reset a stale-session step that already reached a terminal state", async () => {
    const { getDb } = await import("../db.js");
    const { runMedicCheck } = await import("./medic.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const pendingStepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'stale session task', 'running', '{}', ?, ?)"
    ).run(runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, abandoned_count, created_at, updated_at) VALUES (?, ?, 'finished-step', 'agent', 0, '', '', 'done', 'finished', 0, ?, ?)"
    ).run(stepId, runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'pending-step', 'agent', 1, '', '', 'pending', ?, ?)"
    ).run(pendingStepId, runId, now, now);
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_heartbeats (
        session_id TEXT PRIMARY KEY,
        step_id TEXT,
        run_id TEXT,
        last_ping_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'alive',
        created_at TEXT NOT NULL
      )
    `);
    db.prepare(
      "INSERT INTO session_heartbeats (session_id, step_id, run_id, last_ping_at, status, created_at) VALUES ('stale-finished-session', ?, ?, ?, 'alive', ?)"
    ).run(stepId, runId, stale, stale);

    const result = await runMedicCheck();

    const step = db.prepare(
      "SELECT status, output, abandoned_count FROM steps WHERE id = ?"
    ).get(stepId) as { status: string; output: string; abandoned_count: number };
    const finding = result.findings.find((item) => item.stepId === stepId);

    assert.equal(step.status, "done");
    assert.equal(step.output, "finished");
    assert.equal(step.abandoned_count, 0);
    assert.equal(finding?.action, "reset_step");
    assert.equal(finding?.remediated, false);
    assert.equal(result.actionsTaken, 0);
  });
});

describe("getMedicStatus", () => {
  it("counts ISO timestamped checks from the last 24 hours only", async () => {
    const db = new DatabaseSync(":memory:");
    const { ensureMedicTables, getMedicStatus } = await import("./medic.js");
    ensureMedicTables(db);

    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "INSERT INTO medic_checks (id, checked_at, issues_found, actions_taken, summary, details) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("old", old, 1, 1, "old", "[]");
    db.prepare(
      "INSERT INTO medic_checks (id, checked_at, issues_found, actions_taken, summary, details) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("recent", recent, 2, 3, "recent", "[]");

    const status = await getMedicStatus(db, Promise.resolve(true));
    assert.equal(status.recentChecks, 1);
    assert.equal(status.recentIssues, 2);
    assert.equal(status.recentActions, 3);
    db.close();
  });

  it("reports not installed when medic tables exist but the cron is absent", async () => {
    const db = new DatabaseSync(":memory:");
    const { ensureMedicTables, getMedicStatus } = await import("./medic.js");
    ensureMedicTables(db);

    const status = await getMedicStatus(db, Promise.resolve(false));

    assert.equal(status.installed, false);
    assert.equal(status.lastCheck, null);
    assert.equal(status.recentChecks, 0);
    db.close();
  });
});
