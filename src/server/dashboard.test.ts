import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  approveFactoryGate,
  createOrLinkFactoryItem,
  pauseFactoryRun,
} from "../factory/operator.js";
import {
  createFactoryRun,
  recordDeploymentEvent,
  recordFactoryArtifact,
  recordRollbackPlan,
} from "../factory/store.js";
import { getFactoryDashboardSnapshot } from "./dashboard.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("factory operator dashboard snapshot", () => {
  it("maps ledger entities into dashboard query contract", () => {
    const db = memoryDb();
    const intake = createOrLinkFactoryItem({
      title: "Dashboard fixture workflow",
      repo: "fchaudhryspear/antfarm",
      source: "linear",
      priority: "P3",
      operator: "hermes",
      externalRef: "ADP-392",
    }, db);
    const run = createFactoryRun({
      factoryItemId: intake.item.id,
      workflowId: "agent-swarm-v3-dashboard",
      modelPolicy: "balanced",
      budget: { max_usd: 25 },
    }, db);
    pauseFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: run.updated_at, reason: "dashboard fixture pause" }, db);
    approveFactoryGate({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      gateType: "review_approved",
      evidenceUrl: "https://github.com/fchaudhryspear/antfarm/pull/7",
      operator: "hermes",
    }, db);
    recordFactoryArtifact({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      artifactType: "pull_request",
      title: "PR #7",
      pathOrUrl: "https://github.com/fchaudhryspear/antfarm/pull/7",
    }, db);
    recordFactoryArtifact({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      artifactType: "obsidian_mirror",
      title: "Obsidian synthesis",
      pathOrUrl: "obsidian://open?vault=Factory&file=ADP-392",
    }, db);
    const rollback = recordRollbackPlan({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      environment: "production",
      strategy: "restore previous release",
      triggerConditions: ["deploy failed"],
      steps: ["restore"],
      verification: ["health check"],
      approvers: ["atlas"],
      status: "approved",
    }, db);
    recordDeploymentEvent({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollback.id,
      environment: "production",
      status: "succeeded",
      sideEffectingAction: true,
      evidenceUrl: "https://github.com/fchaudhryspear/antfarm/actions/runs/1",
    }, db);

    const snapshot = getFactoryDashboardSnapshot(db);
    assert.equal(snapshot.queue.length, 1);
    assert.equal(snapshot.activeRuns.length, 1);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].item.id, intake.item.id);
    assert.equal(snapshot.items[0].latestRun?.status, "blocked");
    assert.equal(snapshot.items[0].gates.length, 2);
    assert.equal(snapshot.items[0].artifacts.length, 2);
    assert.equal(snapshot.items[0].auditEvents.length, 3);
    assert.equal(snapshot.items[0].production.deploymentEvents.length, 1);
    assert.equal(snapshot.items[0].recoveryControls?.canResume, true);
    assert.equal(snapshot.items[0].recoveryControls?.canRetry, true);
    assert.equal(snapshot.items[0].synthesisLinks.length, 1);
    assert.equal(snapshot.timeline.some((event) => event.source === "dashboard_audit_event"), true);
    assert.equal(snapshot.budget.maxUsd, 25);
  });
});
