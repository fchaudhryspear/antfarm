import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  approveFactoryGate,
  createOrLinkFactoryItem,
  listDashboardAuditEvents,
  pauseFactoryRun,
  resumeFactoryRun,
  retryFactoryRun,
  StaleOperatorCommandError,
} from "./operator.js";
import { createFactoryItem, createFactoryRun, getFactoryItemStatus } from "./store.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("factory operator bridge", () => {
  it("creates or links factory items with dashboard audit evidence", () => {
    const db = memoryDb();

    const created = createOrLinkFactoryItem({
      title: "Hermes intake item",
      repo: "fchaudhryspear/antfarm",
      source: "hermes-kanban",
      operator: "hermes",
      externalRef: "kanban:t_123",
    }, db);
    const linked = createOrLinkFactoryItem({
      factoryItemId: created.item.id,
      title: "Hermes intake item",
      operator: "hermes",
      externalRef: "kanban:t_123",
    }, db);

    assert.equal(created.created, true);
    assert.equal(linked.created, false);
    assert.equal(linked.item.id, created.item.id);

    const status = getFactoryItemStatus(created.item.id, db);
    assert.equal(status.auditEvents.length, 2);
    assert.equal(status.auditEvents[0].command, "intake.create");
    assert.equal(status.auditEvents[1].command, "intake.link");
  });

  it("approves a gate through the operator bridge and records audit evidence", () => {
    const db = memoryDb();
    const item = createFactoryItem({ title: "Approve production gate" }, db);
    const run = createFactoryRun({ factoryItemId: item.id, workflowId: "agent-swarm-v3" }, db);

    const result = approveFactoryGate({
      factoryItemId: item.id,
      factoryRunId: run.id,
      gateType: "production_release",
      evidenceUrl: "https://linear.app/fasoc/issue/ADP-389",
      operator: "hermes",
    }, db);

    assert.equal(result.command, "gate.approve");
    const status = getFactoryItemStatus(item.id, db);
    assert.equal(status.gates.length, 1);
    assert.equal(status.auditEvents.length, 1);
    assert.equal(status.auditEvents[0].target_type, "factory_gate");
  });

  it("pauses, resumes, and retries runs via guarded orchestrator mutations", () => {
    const db = memoryDb();
    const item = createFactoryItem({ title: "Pause resume retry" }, db);
    const run = createFactoryRun({ factoryItemId: item.id, workflowId: "agent-swarm-v3" }, db);

    const paused = pauseFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: run.updated_at, reason: "operator pause" }, db);
    assert.equal(paused.command, "run.pause");

    const blocked = db.prepare("SELECT * FROM factory_runs WHERE id = ?").get(run.id) as { status: string; updated_at: string };
    assert.equal(blocked.status, "blocked");

    assert.throws(
      () => resumeFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: "stale-updated-at" }, db),
      StaleOperatorCommandError,
    );

    const resumed = resumeFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: blocked.updated_at }, db);
    assert.equal(resumed.command, "run.resume");

    db.prepare("UPDATE factory_runs SET status = 'failed', error_summary = 'test failure', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), run.id);
    const failed = db.prepare("SELECT * FROM factory_runs WHERE id = ?").get(run.id) as { updated_at: string };
    const retried = retryFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: failed.updated_at, reason: "retry after fix" }, db);
    assert.equal(retried.command, "run.retry");

    const finalRun = db.prepare("SELECT status, error_summary FROM factory_runs WHERE id = ?").get(run.id) as { status: string; error_summary: string | null };
    assert.equal(finalRun.status, "pending");
    assert.equal(finalRun.error_summary, null);
    assert.equal(listDashboardAuditEvents({ factoryRunId: run.id }, db).length, 3);
  });

  it("rejects stale run mutations without changing state or recording audit", () => {
    const db = memoryDb();
    const item = createFactoryItem({ title: "Reject stale operator mutation" }, db);
    const run = createFactoryRun({ factoryItemId: item.id, workflowId: "agent-swarm-v3" }, db);
    const newerUpdatedAt = new Date(Date.now() + 1000).toISOString();
    db.prepare("UPDATE factory_runs SET updated_at = ? WHERE id = ?").run(newerUpdatedAt, run.id);

    assert.throws(
      () => pauseFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: run.updated_at, reason: "stale pause" }, db),
      StaleOperatorCommandError,
    );

    const current = db.prepare("SELECT status, updated_at FROM factory_runs WHERE id = ?").get(run.id) as { status: string; updated_at: string };
    assert.equal(current.status, "pending");
    assert.equal(current.updated_at, newerUpdatedAt);
    assert.equal(listDashboardAuditEvents({ factoryRunId: run.id }, db).length, 0);
    const operatorEvents = db.prepare("SELECT COUNT(*) AS n FROM factory_events WHERE factory_run_id = ? AND event_type = 'operator.run.pause'").get(run.id) as { n: number };
    assert.equal(operatorEvents.n, 0);
  });
});
