import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  createFactoryItem,
  createFactoryRun,
  getProductionGateState,
  recordDeploymentEvent,
  recordMonitoringObservation,
  recordRollbackPlan,
  recordSmokeTestRun,
} from "./store.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

function createFactoryFixture(db: DatabaseSync) {
  const item = createFactoryItem({
    title: "Ship production gate schema hooks",
    repo: "openclaw/antfarm",
    issueUrl: "https://linear.app/fasoc/issue/ADP-391",
    source: "linear",
    priority: "P2",
  }, db);
  const run = createFactoryRun({
    factoryItemId: item.id,
    workflowId: "agent-swarm-v3-production-gate",
  }, db);
  const rollbackPlan = recordRollbackPlan({
    factoryItemId: item.id,
    factoryRunId: run.id,
    environment: "production",
    strategy: "restore previous release artifact and database-compatible runtime config",
    triggerConditions: ["deploy failed", "smoke suite failed", "monitoring alert inside observation window"],
    steps: ["disable new route", "restore prior release artifact", "verify health checks"],
    verification: ["gateway health is green", "error rate returns to baseline"],
    approvers: ["simon", "atlas"],
    status: "approved",
  }, db);
  return { item, run, rollbackPlan };
}

describe("production gate schema hooks", () => {
  it("creates production gate tables during migration", () => {
    const db = memoryDb();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'deployment_events',
        'smoke_test_runs',
        'monitoring_observations',
        'rollback_plans'
      )
      ORDER BY name
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((table) => table.name), [
      "deployment_events",
      "monitoring_observations",
      "rollback_plans",
      "smoke_test_runs",
    ]);
  });

  it("validates rollback plan schema before recording production gates", () => {
    const db = memoryDb();
    const item = createFactoryItem({ title: "Invalid rollback plan" }, db);

    assert.throws(
      () => recordRollbackPlan({
        factoryItemId: item.id,
        environment: "production",
        strategy: "restore prior release",
        triggerConditions: [],
        steps: ["restore"],
        verification: ["check health"],
        approvers: ["simon"],
      }, db),
      /trigger condition/,
    );
  });

  it("routes successful deploy, smoke, and monitor gates to release completion", () => {
    const db = memoryDb();
    const { item, run, rollbackPlan } = createFactoryFixture(db);

    const deployment = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      environment: "production",
      commitSha: "abcdef1234567890",
      version: "2026.05.24.1",
      status: "succeeded",
      sideEffectingAction: true,
      evidenceUrl: "https://github.com/openclaw/antfarm/actions/runs/1",
    }, db);
    const smoke = recordSmokeTestRun({
      factoryItemId: item.id,
      factoryRunId: run.id,
      deploymentEventId: deployment.id,
      suiteName: "production-smoke",
      status: "passed",
      evidenceUrl: "https://github.com/openclaw/antfarm/actions/runs/2",
    }, db);
    const observation = recordMonitoringObservation({
      factoryItemId: item.id,
      factoryRunId: run.id,
      deploymentEventId: deployment.id,
      status: "clean",
      windowMinutes: 30,
      evidenceUrl: "https://monitoring.example/obs/1",
    }, db);

    assert.equal(deployment.next_route, "smoke_test");
    assert.equal(smoke.next_route, "monitor");
    assert.equal(observation.next_route, "release_complete");

    const state = getProductionGateState(item.id, db);
    assert.equal(state.rollbackPlans.length, 1);
    assert.equal(state.deploymentEvents.length, 1);
    assert.equal(state.smokeTestRuns.length, 1);
    assert.equal(state.monitoringObservations.length, 1);
  });

  it("routes deploy, smoke, and monitor failures to rollback when a plan exists", () => {
    const db = memoryDb();
    const { item, run, rollbackPlan } = createFactoryFixture(db);

    const failedDeployment = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      environment: "production",
      status: "failed",
      sideEffectingAction: true,
    }, db);
    const failedSmoke = recordSmokeTestRun({
      factoryItemId: item.id,
      factoryRunId: run.id,
      deploymentEventId: failedDeployment.id,
      suiteName: "production-smoke",
      status: "failed",
    }, db);
    const alert = recordMonitoringObservation({
      factoryItemId: item.id,
      factoryRunId: run.id,
      deploymentEventId: failedDeployment.id,
      status: "alert",
    }, db);

    assert.equal(failedDeployment.failure_cause, "deploy_failed");
    assert.equal(failedSmoke.failure_cause, "smoke_test_failed");
    assert.equal(alert.failure_cause, "monitoring_alert");
    assert.equal(failedDeployment.next_route, "rollback_required");
    assert.equal(failedSmoke.next_route, "rollback_required");
    assert.equal(alert.next_route, "rollback_required");
  });

  it("blocks automatic retries of side-effecting deployment actions", () => {
    const db = memoryDb();
    const { item, run, rollbackPlan } = createFactoryFixture(db);
    const firstAttempt = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      environment: "production",
      status: "failed",
      sideEffectingAction: true,
    }, db);

    assert.throws(
      () => recordDeploymentEvent({
        factoryItemId: item.id,
        factoryRunId: run.id,
        rollbackPlanId: rollbackPlan.id,
        retryOfDeploymentEventId: firstAttempt.id,
        environment: "production",
        status: "succeeded",
        sideEffectingAction: true,
      }, db),
      /auto-retry is not allowed/,
    );

    const approvedRetry = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      retryOfDeploymentEventId: firstAttempt.id,
      environment: "production",
      status: "succeeded",
      sideEffectingAction: true,
      manualApprovalId: "linear-approval-adp-391",
    }, db);
    assert.equal(approvedRetry.next_route, "smoke_test");
  });

  it("requires approval when a retry becomes side-effecting by default", () => {
    const db = memoryDb();
    const { item, run, rollbackPlan } = createFactoryFixture(db);
    const firstAttempt = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      environment: "production",
      status: "failed",
      sideEffectingAction: false,
    }, db);

    assert.throws(
      () => recordDeploymentEvent({
        factoryItemId: item.id,
        factoryRunId: run.id,
        rollbackPlanId: rollbackPlan.id,
        retryOfDeploymentEventId: firstAttempt.id,
        environment: "production",
        status: "succeeded",
      }, db),
      /auto-retry is not allowed/,
    );

    const approvedRetry = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollbackPlan.id,
      retryOfDeploymentEventId: firstAttempt.id,
      environment: "production",
      status: "succeeded",
      manualApprovalId: "linear-approval-adp-391-retry",
    }, db);
    assert.equal(approvedRetry.side_effecting_action, 1);
    assert.equal(approvedRetry.next_route, "smoke_test");
  });

  it("blocks release when failures have no rollback plan", () => {
    const db = memoryDb();
    const item = createFactoryItem({ title: "No rollback plan", repo: "openclaw/antfarm" }, db);
    const run = createFactoryRun({ factoryItemId: item.id, workflowId: "agent-swarm-v3-production-gate" }, db);
    const deployment = recordDeploymentEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      environment: "production",
      status: "succeeded",
      sideEffectingAction: true,
    }, db);
    const failedSmoke = recordSmokeTestRun({
      factoryItemId: item.id,
      factoryRunId: run.id,
      deploymentEventId: deployment.id,
      suiteName: "production-smoke",
      status: "failed",
    }, db);

    assert.equal(failedSmoke.failure_cause, "smoke_test_failed");
    assert.equal(failedSmoke.next_route, "release_blocked");
  });
});
