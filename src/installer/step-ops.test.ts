import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db.js";
import { buildForcedTierOutput, claimStep, normalizeForcedTier, parseOutputKeyValues } from "./step-ops.js";
import { validateContractAndDispatch } from "../validate-step-output.js";

const cleanupRunIds: string[] = [];
const cleanupTriggerNames: string[] = [];
const STEP_OPS_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/step-ops.ts");

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function insertRun(runId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-workflow', 'claim regression', 'running', '{}', ?, ?)"
  ).run(runId, now, now);
}

afterEach(() => {
  const db = getDb();
  for (const triggerName of cleanupTriggerNames) {
    db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }
  cleanupTriggerNames.length = 0;
  for (const runId of cleanupRunIds) {
    db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
  }
  cleanupRunIds.length = 0;
});

describe("force tier helpers", () => {
  it("normalizes only supported tier overrides", () => {
    assert.equal(normalizeForcedTier(" 1 "), "1");
    assert.equal(normalizeForcedTier("2"), "2");
    assert.equal(normalizeForcedTier("3"), "3");
    assert.equal(normalizeForcedTier("4"), null);
    assert.equal(normalizeForcedTier(""), null);
  });

  it("builds a contract-compliant forced tier response", () => {
    const output = buildForcedTierOutput("2");
    assert.equal(output.includes("TIER: 2"), true);
    assert.equal(output.includes("TIER_LABEL: standard"), true);
    assert.equal(output.includes("SKIP_PHASES: architecture,release"), true);
    assert.equal(validateContractAndDispatch(output, "TIER:").valid, true);
  });
});

describe("parseOutputKeyValues", () => {
  it("normalizes lowercase keys and preserves dispatch status details", () => {
    const parsed = parseOutputKeyValues("swarm_status: running (dispatched swarm-implement-v1 #437)\nstatus: done");
    assert.equal(parsed.SWARM_STATUS, "running (dispatched swarm-implement-v1 #437)");
    assert.equal(parsed.STATUS, "done");
  });
});

describe("idle cron disable command", () => {
  it("uses argv-based cron disable execution", () => {
    const source = fs.readFileSync(STEP_OPS_SOURCE, "utf-8");

    assert.match(source, /execFileSync\("openclaw", \["cron", "disable", match\.id\]/);
    assert.doesNotMatch(source, /execSync\(`openclaw cron disable \$\{match\.id\}`/);
  });
});

describe("claimStep atomic claiming", () => {
  it("returns no work when a normal step is claimed before its guarded update", () => {
    const db = getDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const agentId = `test-agent-${crypto.randomUUID()}`;
    const triggerName = `claim_step_stale_${crypto.randomUUID().replaceAll("-", "_")}`;
    const now = new Date().toISOString();
    cleanupRunIds.push(runId);
    cleanupTriggerNames.push(triggerName);

    insertRun(runId);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'normal', ?, 0, 'Do work for {{run_id}}', '', 'pending', ?, ?)"
    ).run(stepId, runId, agentId, now, now);
    db.exec(`
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE OF status ON steps
      WHEN OLD.id = ${sqlString(stepId)} AND OLD.status = 'pending' AND NEW.status = 'running'
      BEGIN
        UPDATE steps SET status = 'running' WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END
    `);

    const result = claimStep(agentId);

    assert.deepEqual(result, { found: false });
    const row = db.prepare("SELECT status FROM steps WHERE id = ?").get(stepId) as { status: string };
    assert.equal(row.status, "running");
  });

  it("rolls back a loop story claim when the loop step loses its guarded update", () => {
    const db = getDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const storyId = crypto.randomUUID();
    const agentId = `test-agent-${crypto.randomUUID()}`;
    const triggerName = `claim_loop_stale_${crypto.randomUUID().replaceAll("-", "_")}`;
    const now = new Date().toISOString();
    cleanupRunIds.push(runId);
    cleanupTriggerNames.push(triggerName);

    insertRun(runId);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type, loop_config) VALUES (?, ?, 'loop', ?, 0, 'Do {{current_story_id}}', '', 'pending', ?, ?, 'loop', ?)"
    ).run(stepId, runId, agentId, now, now, JSON.stringify({ over: "stories", completion: "all_done" }));
    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, created_at, updated_at) VALUES (?, ?, 0, 'S-1', 'Story one', 'desc', '[]', 'pending', ?, ?)"
    ).run(storyId, runId, now, now);
    db.exec(`
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE OF status ON steps
      WHEN OLD.id = ${sqlString(stepId)} AND OLD.status = 'pending' AND NEW.status = 'running'
      BEGIN
        SELECT RAISE(IGNORE);
      END
    `);

    const result = claimStep(agentId);

    assert.deepEqual(result, { found: false });
    const step = db.prepare("SELECT status, current_story_id FROM steps WHERE id = ?").get(stepId) as { status: string; current_story_id: string | null };
    const story = db.prepare("SELECT status FROM stories WHERE id = ?").get(storyId) as { status: string };
    assert.equal(step.status, "pending");
    assert.equal(step.current_story_id, null);
    assert.equal(story.status, "pending");
  });
});
