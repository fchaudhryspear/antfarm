import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getEmptyRequiredContextVars } from "./run.js";

const RUN_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/run.ts");

describe("runWorkflow context validation", () => {
  it("does not require repo context for workflows that do not declare it", () => {
    const emptyRequired = getEmptyRequiredContextVars(
      { target: "" },
      { task: "do it", target: "production" },
    );

    assert.deepEqual(emptyRequired, []);
  });

  it("requires only workflow-declared empty context placeholders", () => {
    const emptyRequired = getEmptyRequiredContextVars(
      { target: "", repo_path: "/default/repo" },
      { task: "do it" },
    );

    assert.deepEqual(emptyRequired, ["target"]);
  });
});

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

  it("scopes stale-run cancellation by tenant", () => {
    const source = fs.readFileSync(RUN_SOURCE, "utf-8");

    assert.match(source, /conflictingTenantRun/);
    assert.match(source, /different tenant/);
    assert.match(source, /tenant_id = \?/);
    assert.match(source, /tenant_id IS NULL/);
  });

  it("syncs tenant factory ledger state when cron setup fails", () => {
    const source = fs.readFileSync(RUN_SOURCE, "utf-8");

    assert.match(source, /event: "run\.failed"/);
    assert.match(source, /UPDATE factory_runs\s+SET status = 'failed'/);
    assert.match(source, /UPDATE factory_items\s+SET status = 'blocked'/);
  });
});
