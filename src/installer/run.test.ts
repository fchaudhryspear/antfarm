import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RUN_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/run.ts");

describe("runWorkflow startup ordering", () => {
  it("sets up workflow crons before immediate pending-step dispatch", () => {
    const source = fs.readFileSync(RUN_SOURCE, "utf-8");

    const ensureIndex = source.indexOf("await ensureWorkflowCrons(workflow)");
    const dispatchIndex = source.indexOf("triggerImmediateStepEnqueue(pendingAgentIds, runId)");

    assert.notEqual(ensureIndex, -1);
    assert.notEqual(dispatchIndex, -1);
    assert.ok(ensureIndex < dispatchIndex);
  });

  it("marks startup steps failed when cron setup fails before dispatch", () => {
    const source = fs.readFileSync(RUN_SOURCE, "utf-8");

    assert.match(source, /UPDATE runs SET status = 'failed'/);
    assert.match(source, /UPDATE steps\s+SET status = 'failed'/);
    assert.match(source, /WHERE run_id = \? AND status IN \('pending', 'waiting', 'running'\)/);
  });
});
